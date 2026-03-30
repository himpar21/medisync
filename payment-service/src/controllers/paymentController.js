const mongoose = require("mongoose");
const { createHash } = require("node:crypto");
const Payment = require("../models/Payment");
const EventInbox = require("../models/EventInbox");
const publisher = require("../events/publisher");
const { getPublishableKey, getStripeClient } = require("../config/stripe");
const cache = require("../services/paymentCache");

const CACHE_PAYMENT_BY_ID_PREFIX = "payments:id:";
const CACHE_PAYMENT_BY_ORDER_PREFIX = "payments:order:";
const CACHE_PAYMENT_LIST_PREFIX = "payments:list:";
const CACHE_STRIPE_CONFIG_KEY = "payments:stripe:config";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function randomPaymentNumber() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `PAY-${yyyy}${mm}${dd}-${rand}`;
}

function toMinorUnits(amount, currency = "INR") {
  const normalizedCurrency = String(currency || "INR").trim().toUpperCase();
  const zeroDecimalCurrencies = new Set([
    "BIF",
    "CLP",
    "DJF",
    "GNF",
    "JPY",
    "KMF",
    "KRW",
    "MGA",
    "PYG",
    "RWF",
    "UGX",
    "VND",
    "VUV",
    "XAF",
    "XOF",
    "XPF",
  ]);

  if (zeroDecimalCurrencies.has(normalizedCurrency)) {
    return Math.max(0, Math.round(toNumber(amount, 0)));
  }

  return Math.max(0, Math.round(toNumber(amount, 0) * 100));
}

function fromMinorUnits(amount, currency = "INR") {
  const normalizedCurrency = String(currency || "INR").trim().toUpperCase();
  const zeroDecimalCurrencies = new Set([
    "BIF",
    "CLP",
    "DJF",
    "GNF",
    "JPY",
    "KMF",
    "KRW",
    "MGA",
    "PYG",
    "RWF",
    "UGX",
    "VND",
    "VUV",
    "XAF",
    "XOF",
    "XPF",
  ]);

  if (zeroDecimalCurrencies.has(normalizedCurrency)) {
    return Math.max(0, toNumber(amount, 0));
  }

  return Math.max(0, toNumber(amount, 0) / 100);
}

function getStripeMinimumAmountForCurrency(currency) {
  const normalizedCurrency = String(currency || "INR").trim().toUpperCase();

  if (normalizedCurrency === "INR") {
    return Math.max(0, toNumber(process.env.STRIPE_MIN_AMOUNT_INR, 50));
  }

  return 0;
}

function formatPayment(payment) {
  return {
    id: payment._id,
    paymentNumber: payment.paymentNumber,
    orderId: payment.orderId,
    orderNumber: payment.orderNumber,
    userId: payment.userId,
    amount: payment.amount,
    currency: payment.currency,
    method: payment.method,
    status: payment.status,
    gatewayStatus: payment.gatewayStatus,
    transactionRef: payment.transactionRef,
    stripePaymentIntentId: payment.stripePaymentIntentId || "",
    message: payment.message,
    paidAt: payment.paidAt,
    history: payment.history,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}

function buildPaymentIdCacheKey(paymentId) {
  return `${CACHE_PAYMENT_BY_ID_PREFIX}${String(paymentId || "").trim()}`;
}

function buildOrderCacheKey(orderId) {
  return `${CACHE_PAYMENT_BY_ORDER_PREFIX}${String(orderId || "").trim()}`;
}

function buildListCacheKey(status) {
  return `${CACHE_PAYMENT_LIST_PREFIX}${String(status || "all").trim().toLowerCase()}`;
}

async function invalidatePaymentCache({ paymentId = "", orderId = "" } = {}) {
  if (paymentId) {
    await cache.delKey(buildPaymentIdCacheKey(paymentId));
  }

  if (orderId) {
    await cache.delKey(buildOrderCacheKey(orderId));
  }

  await cache.delByPrefix(CACHE_PAYMENT_LIST_PREFIX);
}

async function savePaymentSafely(payment) {
  try {
    await payment.save();
  } catch (error) {
    if (error.name === "VersionError") {
      const conflict = new Error("Payment update conflict detected. Please retry.");
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  }
}

function deriveEventId(eventType, payload, providedEventId, source = "unknown") {
  const direct = String(providedEventId || "").trim();
  if (direct) {
    return direct;
  }

  const rawSeed = `${source}|${eventType}|${String(payload?.orderId || "").trim()}|${String(
    payload?.currentStatus || payload?.status || ""
  ).trim()}|${String(payload?.paymentStatus || "").trim()}|${String(payload?.paymentId || "").trim()}`;

  return createHash("sha1").update(rawSeed).digest("hex");
}

function ensureOwnerOrPrivileged(req, payment) {
  const role = req.user?.role;
  if (["admin", "pharmacist"].includes(role)) {
    return true;
  }
  return String(payment.userId) === String(req.user?.userId);
}

function mapStripeIntent(paymentIntent) {
  const latestCharge =
    paymentIntent.latest_charge && typeof paymentIntent.latest_charge === "object"
      ? paymentIntent.latest_charge
      : null;
  const cardWalletType = latestCharge?.payment_method_details?.card?.wallet?.type || "";
  const paymentMethodType =
    cardWalletType ||
    latestCharge?.payment_method_details?.type ||
    paymentIntent.payment_method_types?.[0] ||
    "stripe";
  const lastError = paymentIntent.last_payment_error?.message || "";

  let status = "pending";
  if (paymentIntent.status === "succeeded") {
    status = "succeeded";
  } else if (paymentIntent.status === "canceled") {
    status = "failed";
  } else if (paymentIntent.status === "requires_payment_method" && lastError) {
    status = "failed";
  }

  const messageByStatus = {
    succeeded: "Payment captured successfully",
    processing: "Payment is processing",
    requires_action: "Additional customer action is required",
    requires_payment_method: lastError || "Payment failed. Choose another payment method",
    requires_confirmation: "Payment confirmation is pending",
    canceled: "Payment was canceled",
  };

  return {
    status,
    method: paymentMethodType,
    gatewayStatus: paymentIntent.status,
    message: messageByStatus[paymentIntent.status] || lastError || "Payment initiated",
    transactionRef: paymentIntent.id,
    paidAt:
      paymentIntent.status === "succeeded"
        ? new Date((paymentIntent.created || Date.now() / 1000) * 1000)
        : null,
  };
}

function isReusablePendingIntent(paymentIntent) {
  const status = String(paymentIntent?.status || "").trim();
  const lastError = String(paymentIntent?.last_payment_error?.message || "").trim();

  if (!status) {
    return false;
  }

  if (status === "requires_payment_method" && lastError) {
    return false;
  }

  return ["requires_payment_method", "requires_confirmation", "requires_action", "processing"].includes(
    status
  );
}

async function cancelStripeIntentIfPossible(stripe, paymentIntentId) {
  if (!paymentIntentId) {
    return null;
  }

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge"],
  });

  if (["succeeded", "canceled"].includes(paymentIntent.status)) {
    return paymentIntent;
  }

  return stripe.paymentIntents.cancel(paymentIntentId, {
    expand: ["latest_charge"],
  });
}

async function closeStalePendingPayments({ stripe, orderId, userId, keepPaymentId = "", keepIntentId = "" }) {
  const stalePayments = await Payment.find({
    orderId,
    userId,
    status: "pending",
    _id: { $ne: keepPaymentId || null },
    stripePaymentIntentId: { $ne: keepIntentId || "" },
  }).sort({ createdAt: -1 });

  await Promise.all(
    stalePayments.map(async (payment) => {
      try {
        if (payment.stripePaymentIntentId) {
          await cancelStripeIntentIfPossible(stripe, payment.stripePaymentIntentId);
        }
      } catch (error) {
        console.warn("Unable to cancel stale Stripe payment intent:", error.message);
      }

      payment.status = "failed";
      payment.gatewayStatus = "cancelled";
      payment.message = "Superseded by the latest payment attempt";
      payment.history.push({
        status: "failed",
        message: "Superseded by the latest payment attempt",
      });
      await savePaymentSafely(payment);
      await invalidatePaymentCache({
        paymentId: String(payment._id),
        orderId: payment.orderId,
      });
    })
  );
}

async function upsertStripePaymentRecord({
  orderId,
  orderNumber,
  userId,
  amount,
  currency,
  paymentIntent,
}) {
  const intentInfo = mapStripeIntent(paymentIntent);

  let payment = await Payment.findOne({
    orderId,
    userId,
    stripePaymentIntentId: paymentIntent.id,
  }).sort({ createdAt: -1 });

  if (!payment) {
    payment = await Payment.findOne({
      orderId,
      userId,
      status: "pending",
      $or: [{ stripePaymentIntentId: "" }, { stripePaymentIntentId: { $exists: false } }],
    }).sort({ createdAt: -1 });
  }

  if (!payment) {
    payment = new Payment({
      paymentNumber: randomPaymentNumber(),
      orderId,
      orderNumber,
      userId,
      amount,
      currency,
    });
  }

  payment.orderNumber = orderNumber || payment.orderNumber;
  payment.amount = amount;
  payment.currency = currency;
  payment.method = intentInfo.method || payment.method || "stripe";
  payment.status = intentInfo.status;
  payment.gatewayStatus = intentInfo.gatewayStatus;
  payment.transactionRef = intentInfo.transactionRef;
  payment.stripePaymentIntentId = paymentIntent.id;
  payment.message = intentInfo.message;
  payment.paidAt = intentInfo.paidAt;
  payment.metadata = {
    ...(payment.metadata || {}),
    source: "stripe.elements",
    stripePaymentIntentId: paymentIntent.id,
  };

  return { payment, intentInfo };
}

async function publishStatusTransition(payment, previousStatus) {
  if (payment.status === previousStatus) {
    return;
  }

  if (payment.status === "succeeded") {
    await publisher.publishPaymentSucceeded(payment);
    return;
  }

  if (payment.status === "failed") {
    await publisher.publishPaymentFailed(payment);
  }
}

exports.getStripeConfig = async (req, res) => {
  const cached = await cache.getJSON(CACHE_STRIPE_CONFIG_KEY);
  if (cached) {
    return res.status(200).json(cached);
  }

  const publishableKey = getPublishableKey();
  if (!publishableKey) {
    return res.status(500).json({ message: "Stripe publishable key is not configured" });
  }

  const payload = { publishableKey };
  await cache.setJSON(CACHE_STRIPE_CONFIG_KEY, payload, 120);
  return res.status(200).json(payload);
};

exports.createPayment = async (req, res) => {
  const orderId = String(req.body.orderId || "").trim();
  const fallbackOrderNumber = String(req.body.orderNumber || "").trim();
  const fallbackCurrency = String(req.body.currency || "INR").trim().toUpperCase();
  const fallbackAmount = toNumber(req.body.amount, -1);

  if (!orderId) {
    return res.status(400).json({ message: "orderId is required" });
  }

  const publishableKey = getPublishableKey();
  if (!publishableKey) {
    return res.status(500).json({ message: "Stripe publishable key is not configured" });
  }

  const stripe = getStripeClient();

  const existingSuccess = await Payment.findOne({
    orderId,
    userId: req.user.userId,
    status: "succeeded",
  }).sort({ createdAt: -1 });

  if (existingSuccess) {
    return res.status(200).json({
      message: "Payment already captured for this order",
      payment: formatPayment(existingSuccess),
      publishableKey,
    });
  }

  const latestPayment = await Payment.findOne({
    orderId,
    userId: req.user.userId,
  }).sort({ createdAt: -1 });

  if (latestPayment?.status === "failed") {
    return res.status(409).json({
      message: latestPayment.message || "Payment failed and this order has been marked as failed",
      code: "payment_failed",
      payment: formatPayment(latestPayment),
      publishableKey,
    });
  }

  const pendingRecord = await Payment.findOne({
    orderId,
    userId: req.user.userId,
    status: "pending",
  }).sort({ createdAt: -1 });

  const orderNumber = pendingRecord?.orderNumber || latestPayment?.orderNumber || fallbackOrderNumber;
  const currency = String(
    pendingRecord?.currency || latestPayment?.currency || fallbackCurrency
  ).trim().toUpperCase();
  const amount = toNumber(pendingRecord?.amount ?? latestPayment?.amount, fallbackAmount);

  if (!orderNumber || amount <= 0) {
    return res.status(400).json({
      message: "orderNumber and positive amount are required to initialize Stripe payment",
    });
  }

  const minimumAmount = getStripeMinimumAmountForCurrency(currency);
  if (minimumAmount > 0 && amount < minimumAmount) {
    return res.status(400).json({
      message: `Stripe payments for this account require at least Rs ${minimumAmount.toFixed(
        2
      )}. Your order total is Rs ${amount.toFixed(2)}.`,
      code: "amount_too_small",
      minimumAmount,
      currency,
    });
  }

  if (pendingRecord?.stripePaymentIntentId) {
    let pendingIntent = await stripe.paymentIntents.retrieve(pendingRecord.stripePaymentIntentId, {
      expand: ["latest_charge"],
    });

    if (mapStripeIntent(pendingIntent).status === "failed" && pendingIntent.status !== "canceled") {
      pendingIntent = await cancelStripeIntentIfPossible(stripe, pendingRecord.stripePaymentIntentId);
    }

    const previousStatus = pendingRecord.status;
    const { payment, intentInfo } = await upsertStripePaymentRecord({
      orderId,
      orderNumber,
      userId: req.user.userId,
      amount,
      currency,
      paymentIntent: pendingIntent,
    });

    if (payment.status !== previousStatus || payment.gatewayStatus !== intentInfo.gatewayStatus) {
      payment.history.push({
        status: payment.status,
        message: intentInfo.message,
      });
      await savePaymentSafely(payment);
    } else if (payment.isModified()) {
      await savePaymentSafely(payment);
    }

    await invalidatePaymentCache({
      paymentId: String(payment._id),
      orderId: payment.orderId,
    });

    if (payment.status === "succeeded") {
      await closeStalePendingPayments({
        stripe,
        orderId,
        userId: req.user.userId,
        keepPaymentId: String(payment._id),
        keepIntentId: payment.stripePaymentIntentId,
      });
      await publishStatusTransition(payment, previousStatus);
      return res.status(200).json({
        message: "Payment already captured for this order",
        payment: formatPayment(payment),
        publishableKey,
      });
    }

    if (payment.status === "failed" || !isReusablePendingIntent(pendingIntent)) {
      await closeStalePendingPayments({
        stripe,
        orderId,
        userId: req.user.userId,
      });
      await publishStatusTransition(payment, previousStatus);
      return res.status(409).json({
        message: payment.message || "Payment failed and this order has been marked as failed",
        code: "payment_failed",
        payment: formatPayment(payment),
        publishableKey,
      });
    }

    await closeStalePendingPayments({
      stripe,
      orderId,
      userId: req.user.userId,
      keepPaymentId: String(payment._id),
      keepIntentId: pendingIntent.id,
    });

    return res.status(200).json({
      message: "Stripe payment already initialized",
      publishableKey,
      clientSecret: pendingIntent.client_secret,
      paymentIntentId: pendingIntent.id,
      payment: formatPayment(payment),
    });
  }

  let paymentIntent;

  try {
    paymentIntent = await stripe.paymentIntents.create({
      amount: toMinorUnits(amount, currency),
      currency: currency.toLowerCase(),
      payment_method_types: ["card"],
      metadata: {
        orderId,
        orderNumber,
        userId: String(req.user.userId || ""),
      },
    });
  } catch (error) {
    if (error?.code === "amount_too_small") {
      return res.status(400).json({
        message:
          error.message ||
          `Stripe payments for this account require a higher minimum amount than Rs ${amount.toFixed(
            2
          )}.`,
        code: "amount_too_small",
        currency,
        minimumAmount,
      });
    }
    throw error;
  }

  const { payment } = await upsertStripePaymentRecord({
    orderId,
    orderNumber,
    userId: req.user.userId,
    amount,
    currency,
    paymentIntent,
  });

  payment.history.push({
    status: "pending",
    message: "Stripe PaymentIntent created",
  });
  await savePaymentSafely(payment);
  await invalidatePaymentCache({
    paymentId: String(payment._id),
    orderId: payment.orderId,
  });

  await closeStalePendingPayments({
    stripe,
    orderId,
    userId: req.user.userId,
    keepPaymentId: String(payment._id),
    keepIntentId: paymentIntent.id,
  });

  return res.status(201).json({
    message: "Stripe payment initialized",
    publishableKey,
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    payment: formatPayment(payment),
  });
};

exports.syncStripePayment = async (req, res) => {
  const orderId = String(req.body.orderId || "").trim();
  const paymentIntentId = String(req.body.paymentIntentId || "").trim();

  if (!orderId || !paymentIntentId) {
    return res.status(400).json({ message: "orderId and paymentIntentId are required" });
  }

  const stripe = getStripeClient();
  let paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge"],
  });

  if (mapStripeIntent(paymentIntent).status === "failed" && paymentIntent.status !== "canceled") {
    paymentIntent = await cancelStripeIntentIfPossible(stripe, paymentIntentId);
  }

  const currency = String(paymentIntent.currency || "INR").trim().toUpperCase();
  const amount = fromMinorUnits(paymentIntent.amount, currency);
  const orderNumber = String(paymentIntent.metadata?.orderNumber || "").trim();

  const existingPayment = await Payment.findOne({
    orderId,
    userId: req.user.userId,
    stripePaymentIntentId: paymentIntentId,
  }).sort({ createdAt: -1 });

  const previousStatus = existingPayment?.status || "pending";
  const { payment, intentInfo } = await upsertStripePaymentRecord({
    orderId,
    orderNumber,
    userId: req.user.userId,
    amount,
    currency,
    paymentIntent,
  });

  payment.history.push({
    status: payment.status,
    message: intentInfo.message,
  });
  await savePaymentSafely(payment);
  await invalidatePaymentCache({
    paymentId: String(payment._id),
    orderId: payment.orderId,
  });

  await publishStatusTransition(payment, previousStatus);

  return res.status(200).json({
    message: intentInfo.message,
    payment: formatPayment(payment),
  });
};

exports.getPaymentById = async (req, res) => {
  const paymentId = String(req.params.paymentId || "").trim();
  if (!paymentId) {
    return res.status(400).json({ message: "paymentId is required" });
  }

  if (!mongoose.isValidObjectId(paymentId)) {
    return res.status(400).json({ message: "Invalid paymentId" });
  }

  const cacheKey = buildPaymentIdCacheKey(paymentId);
  const cached = await cache.getJSON(cacheKey);
  if (cached) {
    if (!ensureOwnerOrPrivileged(req, cached)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    return res.status(200).json({ payment: cached });
  }

  const payment = await Payment.findById(paymentId).lean();
  if (!payment) {
    return res.status(404).json({ message: "Payment not found" });
  }

  const formatted = formatPayment(payment);
  await cache.setJSON(cacheKey, formatted, 45);

  if (!ensureOwnerOrPrivileged(req, formatted)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  return res.status(200).json({ payment: formatted });
};

exports.getPaymentByOrderId = async (req, res) => {
  const orderId = String(req.params.orderId || "").trim();
  if (!orderId) {
    return res.status(400).json({ message: "orderId is required" });
  }

  const cacheKey = buildOrderCacheKey(orderId);
  let payments = await cache.getJSON(cacheKey);

  if (!payments) {
    const dbPayments = await Payment.find({ orderId }).sort({ createdAt: -1 }).limit(20).lean();
    payments = dbPayments.map(formatPayment);
    await cache.setJSON(cacheKey, payments, 30);
  }

  let pendingIncluded = false;
  const visiblePayments = payments.filter((payment) => {
    if (!ensureOwnerOrPrivileged(req, payment)) {
      return false;
    }

    if (payment.status !== "pending") {
      return true;
    }

    if (pendingIncluded) {
      return false;
    }

    pendingIncluded = true;
    return true;
  });

  return res.status(200).json({
    items: visiblePayments,
  });
};

exports.listPayments = async (req, res) => {
  const status = String(req.query.status || "").trim().toLowerCase();
  const query = {};

  if (status) {
    query.status = status;
  }

  const cacheKey = buildListCacheKey(status);
  let items = await cache.getJSON(cacheKey);

  if (!items) {
    const dbItems = await Payment.find(query).sort({ createdAt: -1 }).limit(200).lean();
    items = dbItems.map(formatPayment);
    await cache.setJSON(cacheKey, items, 20);
  }

  return res.status(200).json({
    items,
  });
};

exports.handleOrderEvents = async (req, res) => {
  const expectedSecret = String(process.env.INTERNAL_SERVICE_SECRET || "").trim();
  const incomingSecret = String(req.headers["x-internal-secret"] || "").trim();
  if (expectedSecret && incomingSecret !== expectedSecret) {
    return res.status(401).json({ message: "Invalid internal event signature" });
  }

  const eventType = String(req.body.eventType || "").trim();
  const payload = req.body.payload || {};
  const source = String(req.body.source || req.headers["x-event-source"] || "unknown").trim();
  const eventId = deriveEventId(eventType, payload, req.body.eventId || req.headers["x-event-id"], source);

  if (!eventType) {
    return res.status(400).json({ message: "eventType is required" });
  }

  let inboxCreated = false;
  try {
    await EventInbox.create({
      eventId,
      source,
      eventType,
      receivedAt: new Date(),
    });
    inboxCreated = true;
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(200).json({ ok: true, duplicate: true });
    }
    throw error;
  }

  try {
    if (eventType === "order.created") {
      const orderId = String(payload.orderId || "").trim();
      if (!orderId) {
        return res.status(400).json({ message: "payload.orderId is required for order.created" });
      }

      try {
        const createdPayment = await Payment.findOneAndUpdate(
          {
            orderId,
            userId: String(payload.userId || ""),
            status: "pending",
          },
          {
            $setOnInsert: {
              paymentNumber: randomPaymentNumber(),
              orderId,
              orderNumber: payload.orderNumber || "",
              userId: String(payload.userId || "unknown"),
              amount: toNumber(payload.totalAmount, 0),
              currency: "INR",
              method: "stripe",
              status: "pending",
              gatewayStatus: "awaiting_intent",
              message: "Awaiting Stripe payment initialization",
              metadata: {
                source: "order.event",
              },
              history: [
                {
                  status: "pending",
                  message: "Order created event received",
                },
              ],
            },
          },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
          }
        );

        await invalidatePaymentCache({
          paymentId: String(createdPayment?._id || ""),
          orderId,
        });
      } catch (error) {
        if (error?.code !== 11000) {
          throw error;
        }
      }
    }

    if (eventType === "order.status_updated") {
      const orderId = String(payload.orderId || "").trim();
      if (orderId && ["cancelled", "failed"].includes(String(payload.currentStatus || "").trim())) {
        const failureMessage =
          String(payload.currentStatus || "").trim() === "failed"
            ? "Order failed before payment completion"
            : "Order cancelled before payment";

        const result = await Payment.updateMany(
          {
            orderId,
            status: "pending",
          },
          {
            $set: {
              status: "failed",
              gatewayStatus: "cancelled",
              message: failureMessage,
            },
            $push: {
              history: {
                status: "failed",
                message: failureMessage,
                at: new Date(),
              },
            },
          }
        );

        if (Number(result.modifiedCount || 0) > 0) {
          await invalidatePaymentCache({ orderId });
        }
      }
    }

    await EventInbox.updateOne(
      { eventId },
      {
        $set: {
          processedAt: new Date(),
        },
      }
    );
  } catch (error) {
    if (inboxCreated) {
      await EventInbox.deleteOne({ eventId });
    }
    throw error;
  }

  return res.status(200).json({ ok: true });
};

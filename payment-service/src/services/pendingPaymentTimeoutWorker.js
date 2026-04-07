const Payment = require("../models/Payment");
const publisher = require("../events/publisher");
const { getStripeClient } = require("../config/stripe");
const cache = require("./paymentCache");

const CACHE_PAYMENT_BY_ID_PREFIX = "payments:id:";
const CACHE_PAYMENT_BY_ORDER_PREFIX = "payments:order:";
const CACHE_PAYMENT_LIST_PREFIX = "payments:list:";

const PAYMENT_PENDING_TIMEOUT_MS = Math.max(
  60 * 1000,
  Number(process.env.PAYMENT_PENDING_TIMEOUT_MS || 15 * 60 * 1000)
);
const PAYMENT_TIMEOUT_SWEEP_MS = Math.max(
  5 * 1000,
  Number(process.env.PAYMENT_TIMEOUT_SWEEP_MS || 30 * 1000)
);
const PAYMENT_TIMEOUT_BATCH_SIZE = Math.max(
  1,
  Number(process.env.PAYMENT_TIMEOUT_BATCH_SIZE || 25)
);

function buildPaymentIdCacheKey(paymentId) {
  return `${CACHE_PAYMENT_BY_ID_PREFIX}${String(paymentId || "").trim()}`;
}

function buildOrderCacheKey(orderId) {
  return `${CACHE_PAYMENT_BY_ORDER_PREFIX}${String(orderId || "").trim()}`;
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

async function transitionUsingStripeIntent(payment, paymentIntent) {
  const mapped = mapStripeIntent(paymentIntent);
  const previousStatus = payment.status;

  if (mapped.status === "pending") {
    return false;
  }

  const updated = await Payment.findOneAndUpdate(
    { _id: payment._id, status: "pending" },
    {
      $set: {
        status: mapped.status,
        gatewayStatus: mapped.gatewayStatus,
        message: mapped.message,
        method: mapped.method || payment.method || "stripe",
        transactionRef: mapped.transactionRef || payment.transactionRef || "",
        paidAt: mapped.paidAt,
      },
      $push: {
        history: {
          status: mapped.status,
          message: mapped.message,
          at: new Date(),
        },
      },
    },
    { new: true }
  );

  if (!updated) {
    return false;
  }

  await invalidatePaymentCache({
    paymentId: String(updated._id),
    orderId: updated.orderId,
  });

  if (mapped.status === "succeeded" && previousStatus !== "succeeded") {
    await publisher.publishPaymentSucceeded(updated);
  } else if (mapped.status === "failed" && previousStatus !== "failed") {
    await publisher.publishPaymentFailed(updated);
  }

  return true;
}

async function timeoutPendingPayment(payment) {
  const timeoutMinutes = Math.max(1, Math.round(PAYMENT_PENDING_TIMEOUT_MS / 60000));
  const timeoutMessage = `Payment was not completed within ${timeoutMinutes} minutes from order placement`;

  const updated = await Payment.findOneAndUpdate(
    { _id: payment._id, status: "pending" },
    {
      $set: {
        status: "failed",
        gatewayStatus: "timed_out",
        message: timeoutMessage,
      },
      $push: {
        history: {
          status: "failed",
          message: timeoutMessage,
          at: new Date(),
        },
      },
    },
    { new: true }
  );

  if (!updated) {
    return false;
  }

  await invalidatePaymentCache({
    paymentId: String(updated._id),
    orderId: updated.orderId,
  });

  await publisher.publishPaymentFailed(updated);
  return true;
}

let timeoutWorkerTimer = null;
let isTimeoutWorkerRunning = false;

async function processPendingPaymentTimeoutBatch() {
  if (isTimeoutWorkerRunning) {
    return;
  }
  isTimeoutWorkerRunning = true;

  try {
    const cutoff = new Date(Date.now() - PAYMENT_PENDING_TIMEOUT_MS);
    const expiredPayments = await Payment.find({
      status: "pending",
      $or: [
        { orderPlacedAt: { $lte: cutoff } },
        { orderPlacedAt: null, createdAt: { $lte: cutoff } },
        { orderPlacedAt: { $exists: false }, createdAt: { $lte: cutoff } },
      ],
    })
      .sort({ createdAt: 1 })
      .limit(PAYMENT_TIMEOUT_BATCH_SIZE);

    if (!expiredPayments.length) {
      return;
    }

    let stripeClient = null;
    try {
      stripeClient = getStripeClient();
    } catch (error) {
      console.warn("Pending payment timeout worker could not initialize Stripe client:", error.message);
    }

    for (const payment of expiredPayments) {
      try {
        if (stripeClient && payment.stripePaymentIntentId) {
          let paymentIntent = await stripeClient.paymentIntents.retrieve(payment.stripePaymentIntentId, {
            expand: ["latest_charge"],
          });

          if (await transitionUsingStripeIntent(payment, paymentIntent)) {
            continue;
          }

          if (!["succeeded", "canceled"].includes(paymentIntent.status)) {
            try {
              paymentIntent = await stripeClient.paymentIntents.cancel(payment.stripePaymentIntentId, {
                expand: ["latest_charge"],
              });
              if (await transitionUsingStripeIntent(payment, paymentIntent)) {
                continue;
              }
            } catch (cancelError) {
              console.warn("Unable to cancel timed-out payment intent:", cancelError.message);
            }
          }
        }

        await timeoutPendingPayment(payment);
      } catch (error) {
        console.warn("Pending payment timeout processing failed:", error.message);
      }
    }
  } finally {
    isTimeoutWorkerRunning = false;
  }
}

function startPendingPaymentTimeoutWorker() {
  if (timeoutWorkerTimer) {
    return;
  }

  timeoutWorkerTimer = setInterval(() => {
    processPendingPaymentTimeoutBatch().catch((error) => {
      console.warn("Pending payment timeout worker cycle failed:", error.message);
    });
  }, PAYMENT_TIMEOUT_SWEEP_MS);

  timeoutWorkerTimer.unref?.();
}

function stopPendingPaymentTimeoutWorker() {
  if (!timeoutWorkerTimer) {
    return;
  }

  clearInterval(timeoutWorkerTimer);
  timeoutWorkerTimer = null;
}

module.exports = {
  startPendingPaymentTimeoutWorker,
  stopPendingPaymentTimeoutWorker,
};

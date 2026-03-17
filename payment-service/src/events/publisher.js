const axios = require("axios");

const ANALYTICS_EVENT_URL = process.env.ANALYTICS_EVENT_URL || "";
const ORDER_SERVICE_INTERNAL_URL =
  process.env.ORDER_SERVICE_INTERNAL_URL || "http://127.0.0.1:5003/api/orders/internal";
const INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET || "";
const NOTIFICATION_WEBHOOK_URL = process.env.NOTIFICATION_WEBHOOK_URL || "";

async function dispatch(url, payload, headers = {}) {
  if (!url) {
    return;
  }

  try {
    await axios.post(url, payload, { timeout: 4000, headers });
  } catch (error) {
    console.warn("Dispatch failed:", error.message);
  }
}

async function publishAnalyticsEvent(eventType, payload) {
  if (!ANALYTICS_EVENT_URL) {
    return;
  }

  await dispatch(
    ANALYTICS_EVENT_URL,
    {
    eventType,
    payload,
    emittedAt: new Date().toISOString(),
    },
    INTERNAL_SERVICE_SECRET
      ? {
          "x-internal-secret": INTERNAL_SERVICE_SECRET,
        }
      : {}
  );
}

async function syncOrderPayment(orderId, paymentStatus, status) {
  if (!ORDER_SERVICE_INTERNAL_URL || !orderId) {
    return;
  }

  try {
    await axios.patch(
      `${ORDER_SERVICE_INTERNAL_URL}/${orderId}/payment-status`,
      {
        paymentStatus,
        status,
      },
      {
        timeout: 4000,
        headers: INTERNAL_SERVICE_SECRET
          ? {
              "x-internal-secret": INTERNAL_SERVICE_SECRET,
            }
          : {},
      }
    );
  } catch (error) {
    console.warn("Order payment sync failed:", error.message);
  }
}

async function sendNotification(payment, eventType) {
  const message = {
    eventType,
    paymentId: String(payment._id),
    paymentNumber: payment.paymentNumber,
    orderId: payment.orderId,
    orderNumber: payment.orderNumber,
    userId: payment.userId,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    transactionRef: payment.transactionRef,
    message: payment.message,
    sentAt: new Date().toISOString(),
  };

  console.log("[PaymentNotification]", message);
  await dispatch(NOTIFICATION_WEBHOOK_URL, message);
}

async function publishPaymentSucceeded(payment) {
  await Promise.all([
    publishAnalyticsEvent("payment.succeeded", {
      paymentId: String(payment._id),
      paymentNumber: payment.paymentNumber,
      orderId: payment.orderId,
      orderNumber: payment.orderNumber,
      userId: payment.userId,
      amount: payment.amount,
      currency: payment.currency,
      paidAt: payment.paidAt || new Date().toISOString(),
      method: payment.method,
      transactionRef: payment.transactionRef,
    }),
    syncOrderPayment(payment.orderId, "paid", "confirmed"),
    sendNotification(payment, "payment.succeeded"),
  ]);
}

async function publishPaymentFailed(payment) {
  await Promise.all([
    publishAnalyticsEvent("payment.failed", {
      paymentId: String(payment._id),
      paymentNumber: payment.paymentNumber,
      orderId: payment.orderId,
      orderNumber: payment.orderNumber,
      userId: payment.userId,
      amount: payment.amount,
      currency: payment.currency,
      failedAt: new Date().toISOString(),
      method: payment.method,
      transactionRef: payment.transactionRef,
      message: payment.message,
    }),
    syncOrderPayment(payment.orderId, "failed", "payment_pending"),
    sendNotification(payment, "payment.failed"),
  ]);
}

module.exports = {
  publishPaymentSucceeded,
  publishPaymentFailed,
};

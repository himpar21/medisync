const axios = require("axios");
const { randomUUID } = require("node:crypto");
const OutboxEvent = require("../models/OutboxEvent");

const ANALYTICS_EVENT_URL = process.env.ANALYTICS_EVENT_URL || "";
const ORDER_SERVICE_INTERNAL_URL =
  process.env.ORDER_SERVICE_INTERNAL_URL || "http://127.0.0.1:5003/api/orders/internal";
const INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET || "";
const NOTIFICATION_WEBHOOK_URL = process.env.NOTIFICATION_WEBHOOK_URL || "";

const OUTBOX_POLL_MS = Math.max(500, Number(process.env.PAYMENT_OUTBOX_POLL_MS || 1500));
const OUTBOX_BATCH_SIZE = Math.max(1, Number(process.env.PAYMENT_OUTBOX_BATCH_SIZE || 20));
const OUTBOX_MAX_ATTEMPTS = Math.max(1, Number(process.env.PAYMENT_OUTBOX_MAX_ATTEMPTS || 8));
const OUTBOX_BASE_BACKOFF_MS = Math.max(250, Number(process.env.PAYMENT_OUTBOX_BASE_BACKOFF_MS || 1200));

function getDefaultHeaders(event) {
  return {
    ...(INTERNAL_SERVICE_SECRET ? { "x-internal-secret": INTERNAL_SERVICE_SECRET } : {}),
    "x-event-id": event.eventId,
    "x-event-source": "payment-service",
  };
}

function buildTargetsForPayload(payload) {
  const targets = [];

  if (ANALYTICS_EVENT_URL) {
    targets.push({
      name: "analytics-service",
      url: ANALYTICS_EVENT_URL,
      method: "POST",
      bodyType: "event",
    });
  }

  if (ORDER_SERVICE_INTERNAL_URL && payload?.orderSync?.orderId) {
    targets.push({
      name: "order-service",
      url: `${ORDER_SERVICE_INTERNAL_URL}/${payload.orderSync.orderId}/payment-status`,
      method: "PATCH",
      bodyType: "order_sync",
    });
  }

  if (NOTIFICATION_WEBHOOK_URL && payload?.notification) {
    targets.push({
      name: "notification-webhook",
      url: NOTIFICATION_WEBHOOK_URL,
      method: "POST",
      bodyType: "notification",
    });
  }

  return targets;
}

async function enqueueEvent(eventType, payload) {
  const targets = buildTargetsForPayload(payload);
  if (!targets.length) {
    return null;
  }

  return OutboxEvent.create({
    eventId: randomUUID(),
    eventType,
    payload,
    targets,
    emittedAt: new Date(),
    status: "pending",
    attempts: 0,
    nextAttemptAt: new Date(),
  });
}

function computeBackoffMs(attempts) {
  return Math.floor(OUTBOX_BASE_BACKOFF_MS * 2 ** Math.min(Math.max(0, attempts - 1), 6) + Math.random() * 250);
}

function buildTargetRequest(event, target) {
  if (target.bodyType === "order_sync") {
    return {
      method: "PATCH",
      data: {
        paymentStatus: event.payload?.orderSync?.paymentStatus,
        status: event.payload?.orderSync?.status,
      },
    };
  }

  if (target.bodyType === "notification") {
    return {
      method: "POST",
      data: event.payload?.notification || {},
    };
  }

  return {
    method: "POST",
    data: {
      eventId: event.eventId,
      source: "payment-service",
      eventType: event.eventType,
      payload: event.payload?.analytics || event.payload || {},
      emittedAt: event.emittedAt,
    },
  };
}

async function dispatchTarget(event, target) {
  const targetRequest = buildTargetRequest(event, target);
  await axios.request({
    method: targetRequest.method || target.method || "POST",
    url: target.url,
    data: targetRequest.data,
    timeout: Number(process.env.PAYMENT_EVENT_TIMEOUT_MS || 5000),
    headers: getDefaultHeaders(event),
  });
}

function isOrderSyncCritical(event) {
  return Boolean(event?.payload?.orderSync?.orderId);
}

async function dispatchEvent(event) {
  const results = await Promise.allSettled(
    event.targets.map((target) => dispatchTarget(event, target))
  );

  const failures = results
    .map((result, index) => ({ result, target: event.targets[index] }))
    .filter(({ result }) => result.status === "rejected")
    .map(({ result, target }) => ({
      target,
      message: String(result.reason?.message || result.reason || "event dispatch failed"),
    }));

  if (!failures.length) {
    return;
  }

  const errorSummary = failures
    .map((failure) => `${failure.target?.name || failure.target?.url || "unknown-target"}: ${failure.message}`)
    .join(" | ")
    .slice(0, 1000);

  throw new Error(errorSummary);
}

let workerTimer = null;
let isWorkerRunning = false;

async function processOutboxBatch() {
  if (isWorkerRunning) {
    return;
  }
  isWorkerRunning = true;

  try {
    const dueEvents = await OutboxEvent.find({
      status: "pending",
      nextAttemptAt: { $lte: new Date() },
    })
      .sort({ nextAttemptAt: 1, createdAt: 1 })
      .limit(OUTBOX_BATCH_SIZE);

    for (const event of dueEvents) {
      const claimed = await OutboxEvent.findOneAndUpdate(
        {
          _id: event._id,
          status: "pending",
          nextAttemptAt: { $lte: new Date() },
        },
        {
          $set: { status: "processing" },
          $inc: { attempts: 1 },
        },
        { new: true }
      );

      if (!claimed) {
        continue;
      }

      try {
        await dispatchEvent(claimed);
        await OutboxEvent.updateOne(
          { _id: claimed._id },
          {
            $set: {
              status: "sent",
              lastError: "",
              nextAttemptAt: new Date(8640000000000000),
            },
          }
        );
      } catch (error) {
        const attempts = Number(claimed.attempts || 1);
        const maxedOut = attempts >= OUTBOX_MAX_ATTEMPTS;
        const shouldRetryIndefinitely = isOrderSyncCritical(claimed);
        const markAsFailed = maxedOut && !shouldRetryIndefinitely;

        await OutboxEvent.updateOne(
          { _id: claimed._id },
          {
            $set: {
              status: markAsFailed ? "failed" : "pending",
              nextAttemptAt: markAsFailed
                ? new Date(8640000000000000)
                : new Date(Date.now() + computeBackoffMs(attempts)),
              lastError: String(error?.message || "event dispatch failed").slice(0, 500),
            },
          }
        );
      }
    }
  } finally {
    isWorkerRunning = false;
  }
}

function startOutboxWorker() {
  if (workerTimer) {
    return;
  }

  workerTimer = setInterval(() => {
    processOutboxBatch().catch((error) => {
      console.warn("Payment outbox worker cycle failed:", error.message);
    });
  }, OUTBOX_POLL_MS);

  workerTimer.unref?.();
}

function stopOutboxWorker() {
  if (!workerTimer) {
    return;
  }

  clearInterval(workerTimer);
  workerTimer = null;
}

function toNotificationMessage(payment, eventType) {
  return {
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
}

async function publishPaymentSucceeded(payment) {
  await enqueueEvent("payment.succeeded", {
    analytics: {
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
    },
    orderSync: {
      orderId: payment.orderId,
      paymentStatus: "paid",
      status: "confirmed",
    },
    notification: toNotificationMessage(payment, "payment.succeeded"),
  });
}

async function publishPaymentFailed(payment) {
  await enqueueEvent("payment.failed", {
    analytics: {
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
    },
    orderSync: {
      orderId: payment.orderId,
      paymentStatus: "failed",
      status: "payment_pending",
    },
    notification: toNotificationMessage(payment, "payment.failed"),
  });
}

module.exports = {
  publishPaymentSucceeded,
  publishPaymentFailed,
  startOutboxWorker,
  stopOutboxWorker,
};

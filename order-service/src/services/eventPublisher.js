const axios = require("axios");
const { randomUUID } = require("node:crypto");
const OutboxEvent = require("../models/OutboxEvent");

const PAYMENT_EVENT_URL = process.env.PAYMENT_EVENT_URL || "";
const ANALYTICS_EVENT_URL = process.env.ANALYTICS_EVENT_URL || "";
const INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET || "";

const OUTBOX_POLL_MS = Math.max(500, Number(process.env.ORDER_OUTBOX_POLL_MS || 1500));
const OUTBOX_BATCH_SIZE = Math.max(1, Number(process.env.ORDER_OUTBOX_BATCH_SIZE || 20));
const OUTBOX_MAX_ATTEMPTS = Math.max(1, Number(process.env.ORDER_OUTBOX_MAX_ATTEMPTS || 8));
const OUTBOX_BASE_BACKOFF_MS = Math.max(250, Number(process.env.ORDER_OUTBOX_BASE_BACKOFF_MS || 1200));

function buildTargets() {
  return [
    { name: "payment-service", url: String(PAYMENT_EVENT_URL || "").trim() },
    { name: "analytics-service", url: String(ANALYTICS_EVENT_URL || "").trim() },
  ].filter((target) => target.url);
}

async function enqueueEvent(eventType, payload) {
  const targets = buildTargets();
  if (!targets.length) {
    return null;
  }

  const event = await OutboxEvent.create({
    eventId: randomUUID(),
    eventType,
    payload,
    targets,
    emittedAt: new Date(),
    status: "pending",
    attempts: 0,
    nextAttemptAt: new Date(),
  });

  return event;
}

async function dispatchEventTarget(event, target) {
  await axios.post(
    target.url,
    {
      eventId: event.eventId,
      source: "order-service",
      eventType: event.eventType,
      payload: event.payload,
      emittedAt: event.emittedAt,
    },
    {
      timeout: Number(process.env.ORDER_EVENT_TIMEOUT_MS || 5000),
      headers: {
        ...(INTERNAL_SERVICE_SECRET ? { "x-internal-secret": INTERNAL_SERVICE_SECRET } : {}),
        "x-event-id": event.eventId,
        "x-event-source": "order-service",
      },
    }
  );
}

async function dispatchEvent(event) {
  await Promise.all(event.targets.map((target) => dispatchEventTarget(event, target)));
}

function computeBackoffMs(attempts) {
  const cappedAttempts = Math.max(1, attempts);
  return Math.floor(OUTBOX_BASE_BACKOFF_MS * 2 ** Math.min(cappedAttempts - 1, 6) + Math.random() * 250);
}

let workerTimer = null;
let isWorkerRunning = false;

async function processPendingEvents() {
  if (isWorkerRunning) {
    return;
  }

  isWorkerRunning = true;

  try {
    const now = new Date();
    const dueEvents = await OutboxEvent.find({
      status: "pending",
      nextAttemptAt: { $lte: now },
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
        const nextAttemptAt = new Date(Date.now() + computeBackoffMs(attempts));
        await OutboxEvent.updateOne(
          { _id: claimed._id },
          {
            $set: {
              status: maxedOut ? "failed" : "pending",
              nextAttemptAt: maxedOut ? new Date(8640000000000000) : nextAttemptAt,
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
    processPendingEvents().catch((error) => {
      console.warn("Order outbox worker cycle failed:", error.message);
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

async function publishOrderCreated(order) {
  await enqueueEvent("order.created", {
    orderId: String(order._id),
    orderNumber: order.orderNumber,
    userId: String(order.userId),
    totalAmount: order.totalAmount,
    status: order.status,
    address: order.address,
    items: order.items.map((item) => ({
      medicineId: item.medicineId,
      medicineName: item.medicineName,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
    })),
    pickupSlot: order.pickupSlot,
    placedAt: order.placedAt,
  });
}

async function publishOrderStatusUpdated(order, previousStatus) {
  await enqueueEvent("order.status_updated", {
    orderId: String(order._id),
    orderNumber: order.orderNumber,
    userId: String(order.userId),
    previousStatus,
    currentStatus: order.status,
    paymentStatus: order.paymentStatus,
    updatedAt: new Date().toISOString(),
  });
}

module.exports = {
  publishOrderCreated,
  publishOrderStatusUpdated,
  startOutboxWorker,
  stopOutboxWorker,
};

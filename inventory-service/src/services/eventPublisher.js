const { randomUUID } = require("node:crypto");
const OutboxEvent = require("../models/OutboxEvent");

const ANALYTICS_EVENT_URL = String(process.env.ANALYTICS_EVENT_URL || "").trim();
const INTERNAL_SERVICE_SECRET = String(process.env.INTERNAL_SERVICE_SECRET || "").trim();

const OUTBOX_POLL_MS = Math.max(500, Number(process.env.INVENTORY_OUTBOX_POLL_MS || 1500));
const OUTBOX_BATCH_SIZE = Math.max(1, Number(process.env.INVENTORY_OUTBOX_BATCH_SIZE || 20));
const OUTBOX_MAX_ATTEMPTS = Math.max(1, Number(process.env.INVENTORY_OUTBOX_MAX_ATTEMPTS || 8));
const OUTBOX_BASE_BACKOFF_MS = Math.max(250, Number(process.env.INVENTORY_OUTBOX_BASE_BACKOFF_MS || 1200));

function computeBackoffMs(attempts) {
  return Math.floor(OUTBOX_BASE_BACKOFF_MS * 2 ** Math.min(Math.max(0, attempts - 1), 6) + Math.random() * 250);
}

async function enqueue(eventType, payload) {
  if (!ANALYTICS_EVENT_URL) {
    return null;
  }

  return OutboxEvent.create({
    eventId: randomUUID(),
    eventType,
    payload,
    emittedAt: new Date(),
    status: "pending",
    attempts: 0,
    nextAttemptAt: new Date(),
  });
}

async function dispatch(event) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Number(process.env.INVENTORY_EVENT_TIMEOUT_MS || 5000)
  );

  let response;
  try {
    response = await fetch(ANALYTICS_EVENT_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(INTERNAL_SERVICE_SECRET ? { "x-internal-secret": INTERNAL_SERVICE_SECRET } : {}),
        "x-event-id": event.eventId,
        "x-event-source": "inventory-service",
      },
      body: JSON.stringify({
        eventId: event.eventId,
        source: "inventory-service",
        eventType: event.eventType,
        payload: event.payload,
        emittedAt: event.emittedAt,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Inventory event dispatch failed with status ${response.status}`);
  }
}

let workerTimer = null;
let isWorkerRunning = false;

async function processBatch() {
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
        await dispatch(claimed);
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

        await OutboxEvent.updateOne(
          { _id: claimed._id },
          {
            $set: {
              status: maxedOut ? "failed" : "pending",
              nextAttemptAt: maxedOut
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
    processBatch().catch((error) => {
      console.warn("Inventory outbox worker cycle failed:", error.message);
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

async function publishMedicineCreated(medicine) {
  await enqueue("inventory.medicine_created", {
    medicineId: String(medicine._id),
    code: medicine.code,
    name: medicine.name,
    category: medicine.category,
    stock: Number(medicine.stock || 0),
    availableStock: Math.max(0, Number(medicine.stock || 0) - Number(medicine.reservedStock || 0)),
    occurredAt: new Date().toISOString(),
  });
}

async function publishMedicineUpdated(medicine) {
  await enqueue("inventory.medicine_updated", {
    medicineId: String(medicine._id),
    code: medicine.code,
    name: medicine.name,
    category: medicine.category,
    stock: Number(medicine.stock || 0),
    reservedStock: Number(medicine.reservedStock || 0),
    availableStock: Math.max(0, Number(medicine.stock || 0) - Number(medicine.reservedStock || 0)),
    occurredAt: new Date().toISOString(),
  });
}

async function publishMedicineDeleted(medicineId) {
  await enqueue("inventory.medicine_deleted", {
    medicineId: String(medicineId),
    occurredAt: new Date().toISOString(),
  });
}

module.exports = {
  publishMedicineCreated,
  publishMedicineUpdated,
  publishMedicineDeleted,
  startOutboxWorker,
  stopOutboxWorker,
};

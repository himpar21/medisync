const { randomUUID } = require("node:crypto");

const ANALYTICS_EVENT_URL = String(process.env.ANALYTICS_EVENT_URL || "").trim();
const INTERNAL_SERVICE_SECRET = String(process.env.INTERNAL_SERVICE_SECRET || "").trim();
const POLL_MS = Math.max(500, Number(process.env.AUTH_EVENT_POLL_MS || 1200));
const MAX_ATTEMPTS = Math.max(1, Number(process.env.AUTH_EVENT_MAX_ATTEMPTS || 6));

const queue = [];
let timer = null;
let workerBusy = false;

function enqueue(eventType, payload) {
  if (!ANALYTICS_EVENT_URL) {
    return;
  }

  queue.push({
    eventId: randomUUID(),
    source: "auth-service",
    eventType,
    payload,
    emittedAt: new Date().toISOString(),
    attempts: 0,
    nextAttemptAt: Date.now(),
  });
}

function computeBackoff(attempts) {
  return Math.floor(300 * 2 ** Math.min(attempts, 6) + Math.random() * 120);
}

async function processQueue() {
  if (workerBusy || !queue.length) {
    return;
  }

  const now = Date.now();
  const event = queue.find((item) => item.nextAttemptAt <= now);
  if (!event) {
    return;
  }

  workerBusy = true;
  try {
    event.attempts += 1;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Number(process.env.AUTH_EVENT_TIMEOUT_MS || 4000)
    );

    let response;
    try {
      response = await fetch(ANALYTICS_EVENT_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(INTERNAL_SERVICE_SECRET ? { "x-internal-secret": INTERNAL_SERVICE_SECRET } : {}),
          "x-event-id": event.eventId,
          "x-event-source": event.source,
        },
        body: JSON.stringify({
          eventId: event.eventId,
          source: event.source,
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
      throw new Error(`Event publish failed with status ${response.status}`);
    }

    const index = queue.indexOf(event);
    if (index >= 0) {
      queue.splice(index, 1);
    }
  } catch (error) {
    if (event.attempts >= MAX_ATTEMPTS) {
      const index = queue.indexOf(event);
      if (index >= 0) {
        queue.splice(index, 1);
      }
    } else {
      event.nextAttemptAt = Date.now() + computeBackoff(event.attempts);
    }
  } finally {
    workerBusy = false;
  }
}

function startWorker() {
  if (timer) {
    return;
  }

  timer = setInterval(() => {
    processQueue().catch((error) => {
      console.warn("Auth event worker cycle failed:", error.message);
    });
  }, POLL_MS);

  timer.unref?.();
}

function stopWorker() {
  if (!timer) {
    return;
  }

  clearInterval(timer);
  timer = null;
}

module.exports = {
  enqueue,
  startWorker,
  stopWorker,
};

const { createHash } = require("node:crypto");
const aggregationService = require("../services/aggregationService");
const EventInbox = require("../models/EventInbox");
const summaryCache = require("../services/summaryCache");

const SUMMARY_CACHE_KEY = "summary";

async function loadSummaryCached() {
  const cached = await summaryCache.get(SUMMARY_CACHE_KEY);
  if (cached) {
    return cached;
  }

  const summary = await aggregationService.getSummary();
  await summaryCache.set(SUMMARY_CACHE_KEY, summary);
  return summary;
}

function deriveEventId(eventType, payload, providedEventId, source = "unknown") {
  const direct = String(providedEventId || "").trim();
  if (direct) {
    return direct;
  }

  const rawSeed = `${source}|${eventType}|${String(payload?.orderId || "").trim()}|${String(
    payload?.paymentId || ""
  ).trim()}|${String(payload?.currentStatus || payload?.status || "").trim()}`;

  return createHash("sha1").update(rawSeed).digest("hex");
}

exports.ingestEvent = async (req, res) => {
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
    await aggregationService.ingestEvent({
      eventType,
      payload,
      emittedAt: req.body.emittedAt,
    });

    await summaryCache.del(SUMMARY_CACHE_KEY);

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

exports.getSummary = async (req, res) => {
  const summary = await loadSummaryCached();
  return res.status(200).json(summary);
};

exports.getDailySales = async (req, res) => {
  const summary = await loadSummaryCached();
  return res.status(200).json({ items: summary.dailySales });
};

exports.getTopMedicines = async (req, res) => {
  const summary = await loadSummaryCached();
  return res.status(200).json({ items: summary.topMedicines });
};

exports.getUserActivity = async (req, res) => {
  const summary = await loadSummaryCached();
  return res.status(200).json({ items: summary.userActivity });
};

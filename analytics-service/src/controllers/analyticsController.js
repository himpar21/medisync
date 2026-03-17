const aggregationService = require("../services/aggregationService");

exports.ingestEvent = async (req, res) => {
  const expectedSecret = String(process.env.INTERNAL_SERVICE_SECRET || "").trim();
  const incomingSecret = String(req.headers["x-internal-secret"] || "").trim();
  if (expectedSecret && incomingSecret !== expectedSecret) {
    return res.status(401).json({ message: "Invalid internal event signature" });
  }

  await aggregationService.ingestEvent({
    eventType: req.body.eventType,
    payload: req.body.payload,
    emittedAt: req.body.emittedAt,
  });

  return res.status(200).json({ ok: true });
};

exports.getSummary = async (req, res) => {
  const summary = await aggregationService.getSummary();
  return res.status(200).json(summary);
};

exports.getDailySales = async (req, res) => {
  const summary = await aggregationService.getSummary();
  return res.status(200).json({ items: summary.dailySales });
};

exports.getTopMedicines = async (req, res) => {
  const summary = await aggregationService.getSummary();
  return res.status(200).json({ items: summary.topMedicines });
};

exports.getUserActivity = async (req, res) => {
  const summary = await aggregationService.getSummary();
  return res.status(200).json({ items: summary.userActivity });
};

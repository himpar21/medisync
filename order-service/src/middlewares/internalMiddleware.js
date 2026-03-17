function verifyInternalRequest(req, res, next) {
  const expectedSecret = String(process.env.INTERNAL_SERVICE_SECRET || "").trim();
  if (!expectedSecret) {
    return next();
  }

  const incomingSecret = String(req.headers["x-internal-secret"] || "").trim();
  if (incomingSecret !== expectedSecret) {
    return res.status(401).json({ message: "Invalid internal service signature" });
  }

  return next();
}

module.exports = {
  verifyInternalRequest,
};

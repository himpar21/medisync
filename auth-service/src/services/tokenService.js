const jwt = require("jsonwebtoken");

const ROLE_ALIASES = {
  patient: "student",
};

function normalizeRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  return ROLE_ALIASES[normalized] || normalized;
}

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
  });
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = {
  normalizeRole,
  signToken,
  verifyToken,
};

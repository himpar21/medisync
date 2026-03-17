const jwt = require("jsonwebtoken");

function extractToken(req) {
  const authHeader = String(req.headers.authorization || "");
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }
  return token;
}

function parsePayload(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

function attachUserFromPayload(req, payload) {
  req.user = {
    userId: payload.userId,
    role: payload.role,
  };
}

function authenticate(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ message: "Authorization token is missing" });
  }

  try {
    const payload = parsePayload(token);
    attachUserFromPayload(req, payload);
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

function optionalAuthenticate(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return next();
  }

  try {
    const payload = parsePayload(token);
    attachUserFromPayload(req, payload);
  } catch (error) {
    // Ignore invalid optional tokens and continue as anonymous.
  }
  return next();
}

function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden: insufficient role" });
    }

    return next();
  };
}

module.exports = {
  authenticate,
  optionalAuthenticate,
  authorize,
};

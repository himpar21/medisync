const { verifyToken, normalizeRole } = require("../services/tokenService");

function authenticate(req, res, next) {
  const authHeader = String(req.headers.authorization || "");
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Authorization token is missing" });
  }

  try {
    const payload = verifyToken(token);
    req.user = {
      userId: payload.userId,
      role: normalizeRole(payload.role),
    };
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
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
  authorize,
};

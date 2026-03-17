const jwt = require("jsonwebtoken");

const PRIVILEGED_ROLES = ["admin", "pharmacist"];
const ROLE_ALIASES = {
  patient: "student",
};

function normalizeRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  return ROLE_ALIASES[normalized] || normalized;
}

function isPublicRoute(req) {
  const method = String(req.method || "GET").toUpperCase();
  const path = String(req.path || "");

  if (path === "/health") {
    return true;
  }

  if (path.startsWith("/api/auth")) {
    return true;
  }

  if (
    method === "GET" &&
    (path === "/api/orders/medicines" ||
      path === "/api/orders/pickup-slots" ||
      path === "/api/inventory/medicines" ||
      path.startsWith("/api/inventory/medicines/") ||
      path === "/api/inventory/categories")
  ) {
    return true;
  }

  if (method === "POST" && (path === "/api/payments/events" || path === "/api/analytics/events")) {
    return true;
  }

  return false;
}

function getRequiredRoles(req) {
  const method = String(req.method || "GET").toUpperCase();
  const path = String(req.path || "");

  if (path.startsWith("/api/analytics") && path !== "/api/analytics/events") {
    return PRIVILEGED_ROLES;
  }

  if (path.startsWith("/api/inventory/alerts")) {
    return PRIVILEGED_ROLES;
  }

  if (path.startsWith("/api/inventory/medicines") && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return PRIVILEGED_ROLES;
  }

  if (method === "PATCH" && /^\/api\/orders\/[^/]+\/status$/.test(path)) {
    return PRIVILEGED_ROLES;
  }

  return null;
}

function gatewayAuth(req, res, next) {
  if (isPublicRoute(req)) {
    return next();
  }

  const authHeader = String(req.headers.authorization || "");
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Authorization token is missing" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const role = normalizeRole(payload.role);

    req.user = {
      userId: payload.userId,
      role,
    };

    req.headers["x-user-id"] = payload.userId;
    req.headers["x-user-role"] = role;

    const requiredRoles = getRequiredRoles(req);
    if (requiredRoles && !requiredRoles.includes(role)) {
      return res.status(403).json({ message: "Forbidden: insufficient role" });
    }

    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

module.exports = {
  gatewayAuth,
};

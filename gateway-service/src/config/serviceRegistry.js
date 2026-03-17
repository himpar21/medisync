function buildServiceRegistry() {
  return [
    {
      key: "auth",
      prefix: "/api/auth",
      target: process.env.AUTH_SERVICE_URL || "http://127.0.0.1:5001",
    },
    {
      key: "inventory",
      prefix: "/api/inventory",
      target: process.env.INVENTORY_SERVICE_URL || "http://127.0.0.1:5002",
    },
    {
      key: "orders",
      prefix: "/api/orders",
      target: process.env.ORDER_SERVICE_URL || "http://127.0.0.1:5003",
    },
    {
      key: "payments",
      prefix: "/api/payments",
      target: process.env.PAYMENT_SERVICE_URL || "http://127.0.0.1:5004",
    },
    {
      key: "analytics",
      prefix: "/api/analytics",
      target: process.env.ANALYTICS_SERVICE_URL || "http://127.0.0.1:5005",
    },
  ];
}

module.exports = {
  buildServiceRegistry,
};

const express = require("express");
const cors = require("cors");
const orderRoutes = require("./routes/orderRoutes");

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL || "*",
  })
);
app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({
    service: "order-service",
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/orders", orderRoutes);

app.use((err, req, res, next) => {
  console.error("Order service error:", err);
  res.status(err.statusCode || 500).json({
    message: err.message || "Internal server error",
  });
});

module.exports = app;

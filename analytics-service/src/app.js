const express = require("express");
const cors = require("cors");
const analyticsRoutes = require("./routes/analyticsRoutes");

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL || "*",
  })
);
app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({
    service: "analytics-service",
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/analytics", analyticsRoutes);

app.use((err, req, res, next) => {
  console.error("Analytics service error:", err);
  res.status(err.statusCode || 500).json({
    message: err.message || "Internal server error",
  });
});

module.exports = app;

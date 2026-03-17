const express = require("express");
const cors = require("cors");
const inventoryRoutes = require("./routes/inventoryRoutes");

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL || "*",
  })
);
app.use(express.json({ limit: "10mb" }));

app.get("/health", (req, res) => {
  res.status(200).json({
    service: "inventory-service",
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/inventory", inventoryRoutes);

app.use((err, req, res, next) => {
  console.error("Inventory service error:", err);
  res.status(err.statusCode || 500).json({
    message: err.message || "Internal server error",
  });
});

module.exports = app;

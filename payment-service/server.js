require("dotenv").config();
const dns = require("node:dns/promises");
const mongoose = require("mongoose");
const app = require("./src/app");
const { startOutboxWorker, stopOutboxWorker } = require("./src/events/publisher");
const {
  startPendingPaymentTimeoutWorker,
  stopPendingPaymentTimeoutWorker,
} = require("./src/services/pendingPaymentTimeoutWorker");

function configureDns() {
  const rawServers = String(process.env.DNS_SERVERS || "").trim();
  if (!rawServers) {
    return;
  }

  const servers = rawServers
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!servers.length) {
    return;
  }

  try {
    dns.setServers(servers);
    console.log(`Payment Service using custom DNS servers: ${servers.join(", ")}`);
  } catch (error) {
    console.warn("Payment Service DNS override skipped:", error.message);
  }
}

configureDns();

const PORT = process.env.PORT || 5004;

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log("Payment Service connected to MongoDB");
    startOutboxWorker();
    startPendingPaymentTimeoutWorker();

    app.listen(PORT, () => {
      console.log(`Payment Service running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Payment Service failed to start:", error.message);
    process.exit(1);
  }
}

startServer();

process.on("SIGINT", () => {
  stopOutboxWorker();
  stopPendingPaymentTimeoutWorker();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopOutboxWorker();
  stopPendingPaymentTimeoutWorker();
  process.exit(0);
});

require("dotenv").config();
const dns = require("node:dns/promises");
const mongoose = require("mongoose");
const app = require("./src/app");
const { startOutboxWorker, stopOutboxWorker } = require("./src/services/eventPublisher");

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
    console.log(`Order Service using custom DNS servers: ${servers.join(", ")}`);
  } catch (error) {
    console.warn("Order Service DNS override skipped:", error.message);
  }
}

configureDns();

const PORT = process.env.PORT || 5003;

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log("Order Service connected to MongoDB");
    startOutboxWorker();

    app.listen(PORT, () => {
      console.log(`Order Service running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Order Service failed to start:", error.message);
    process.exit(1);
  }
}

startServer();

process.on("SIGINT", () => {
  stopOutboxWorker();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopOutboxWorker();
  process.exit(0);
});

const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const dns = require("node:dns/promises");
const app = require("./src/app");
const mongoose = require("mongoose");
const { startWorker, stopWorker } = require("./src/services/eventPublisher");
const DEFAULT_DNS_SERVERS = ["8.8.8.8", "1.1.1.1"];

function applyDnsServers(rawServers = "") {
  const cleaned = String(rawServers)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!cleaned.length) {
    return false;
  }

  try {
    dns.setServers(cleaned);
    console.log(`Auth Service using DNS servers: ${cleaned.join(", ")}`);
    return true;
  } catch (error) {
    console.warn("Auth Service DNS override skipped:", error.message);
    return false;
  }
}

function configureDns() {
  const rawServers = String(process.env.DNS_SERVERS || "").trim();
  if (!rawServers) {
    return false;
  }
  return applyDnsServers(rawServers);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

configureDns();

const PORT = process.env.PORT || 5001;

async function connectMongoWithRetry() {
  const maxAttempts = Math.max(1, Number(process.env.MONGO_CONNECT_RETRIES || 4));
  const baseDelayMs = Math.max(500, Number(process.env.MONGO_RETRY_DELAY_MS || 1500));
  const timeoutMs = Math.max(10000, Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 20000));
  let usedFallbackDns = false;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: timeoutMs,
      });
      return;
    } catch (error) {
      lastError = error;
      const msg = String(error?.message || "");
      const isSrvLookupTimeout = msg.includes("querySrv ETIMEOUT");
      const isServerSelectionTimeout = msg.includes("Server selection timed out");

      if (!usedFallbackDns && (isSrvLookupTimeout || isServerSelectionTimeout)) {
        usedFallbackDns = applyDnsServers(DEFAULT_DNS_SERVERS.join(","));
      }

      if (attempt < maxAttempts) {
        const waitMs = baseDelayMs * attempt;
        console.warn(`Auth Mongo connect failed (attempt ${attempt}/${maxAttempts}): ${msg}`);
        console.warn(`Retrying in ${waitMs}ms...`);
        await sleep(waitMs);
      }
    }
  }

  throw lastError || new Error("MongoDB connection failed");
}

async function startServer() {
  try {
    await connectMongoWithRetry();
    console.log("Auth Service connected to MongoDB");
    startWorker();

    app.listen(PORT, () => {
      console.log(`Auth Service is running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Auth Service failed to start:", error.message);
    process.exit(1);
  }
}

startServer();

process.on("SIGINT", () => {
  stopWorker();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopWorker();
  process.exit(0);
});

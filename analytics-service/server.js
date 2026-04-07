require("dotenv").config();
const dns = require("node:dns/promises");
const mongoose = require("mongoose");
const app = require("./src/app");

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
    console.log(`Analytics Service using custom DNS servers: ${servers.join(", ")}`);
  } catch (error) {
    console.warn("Analytics Service DNS override skipped:", error.message);
  }
}

configureDns();

const PORT = process.env.PORT || 5005;

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log("Analytics Service connected to MongoDB");

    app.listen(PORT, () => {
      console.log(`Analytics Service running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Analytics Service failed to start:", error.message);
    process.exit(1);
  }
}

startServer();

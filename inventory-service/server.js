require("dotenv").config();
const dns = require("node:dns/promises");
const mongoose = require("mongoose");
const app = require("./src/app");
const { startOutboxWorker, stopOutboxWorker } = require("./src/services/eventPublisher");

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const PORT = process.env.PORT || 5002;

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log("Inventory Service connected to MongoDB");
    startOutboxWorker();

    app.listen(PORT, () => {
      console.log(`Inventory Service running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Inventory Service failed to start:", error.message);
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

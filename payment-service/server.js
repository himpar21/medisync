require("dotenv").config();
const dns = require("node:dns/promises");
const mongoose = require("mongoose");
const app = require("./src/app");
const { startOutboxWorker, stopOutboxWorker } = require("./src/events/publisher");

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const PORT = process.env.PORT || 5004;

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log("Payment Service connected to MongoDB");
    startOutboxWorker();

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
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopOutboxWorker();
  process.exit(0);
});

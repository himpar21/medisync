require("dotenv").config();
const dns = require("node:dns/promises");
const app = require("./src/app");
const mongoose = require("mongoose");
const { startWorker, stopWorker } = require("./src/services/eventPublisher");

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const PORT = process.env.PORT || 5001;

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });
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

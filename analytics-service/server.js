require("dotenv").config();
const dns = require("node:dns/promises");
const mongoose = require("mongoose");
const app = require("./src/app");

dns.setServers(["8.8.8.8", "1.1.1.1"]);

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

require("dotenv").config();
const dns = require("node:dns/promises");
const mongoose = require("mongoose");
const app = require("./src/app");

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const PORT = process.env.PORT || 5003;

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log("Order Service connected to MongoDB");

    app.listen(PORT, () => {
      console.log(`Order Service running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Order Service failed to start:", error.message);
    process.exit(1);
  }
}

startServer();

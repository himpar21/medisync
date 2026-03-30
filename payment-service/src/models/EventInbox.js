const mongoose = require("mongoose");

const eventInboxSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    source: {
      type: String,
      default: "unknown",
      trim: true,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    receivedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    processedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true, optimisticConcurrency: true }
);

eventInboxSchema.index({ receivedAt: 1 }, { expireAfterSeconds: Math.max(86400, Number(process.env.EVENT_INBOX_TTL_SECONDS || 604800)) });

module.exports = mongoose.model("EventInbox", eventInboxSchema);

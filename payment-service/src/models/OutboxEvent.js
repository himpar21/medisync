const mongoose = require("mongoose");

const outboxTargetSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    method: { type: String, default: "POST", trim: true },
    bodyType: { type: String, default: "event", trim: true },
  },
  { _id: false }
);

const outboxEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    eventType: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    emittedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "sent", "failed"],
      default: "pending",
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    nextAttemptAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    lastError: {
      type: String,
      default: "",
      trim: true,
    },
    targets: {
      type: [outboxTargetSchema],
      default: [],
    },
  },
  { timestamps: true, optimisticConcurrency: true }
);

outboxEventSchema.index({ status: 1, nextAttemptAt: 1 });

module.exports = mongoose.model("OutboxEvent", outboxEventSchema);

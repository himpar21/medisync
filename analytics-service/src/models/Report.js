const mongoose = require("mongoose");

const reportItemSchema = new mongoose.Schema(
  {
    medicineId: { type: String, required: true, trim: true },
    medicineName: { type: String, default: "", trim: true },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const reportSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    orderNumber: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      default: "placed",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
      index: true,
    },
    totalAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    items: {
      type: [reportItemSchema],
      default: [],
    },
    placedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    paidAt: {
      type: Date,
      default: null,
      index: true,
    },
    lastEventAt: {
      type: Date,
      default: Date.now,
    },
    rawEvents: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Report", reportSchema);

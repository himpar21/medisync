const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    medicineId: { type: String, required: true, trim: true },
    medicineName: { type: String, required: true, trim: true },
    category: { type: String, default: "General", trim: true },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    updatedBy: { type: String, default: "system" },
    at: { type: Date, default: Date.now },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: [(items) => items.length > 0, "Order must contain items"],
    },
    totalItems: {
      type: Number,
      required: true,
      min: 1,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    tax: {
      type: Number,
      default: 0,
      min: 0,
    },
    deliveryFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "INR",
    },
    pickupSlot: {
      date: { type: Date, required: true },
      label: { type: String, required: true },
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: [
        "placed",
        "payment_pending",
        "confirmed",
        "ready_for_pickup",
        "picked_up",
        "cancelled",
      ],
      default: "placed",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },
    inventoryStatus: {
      type: String,
      enum: ["reserved", "released", "deducted", "failed"],
      default: "reserved",
    },
    idempotencyKey: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    note: {
      type: String,
      default: "",
      trim: true,
    },
    statusHistory: {
      type: [statusHistorySchema],
      default: [],
    },
    placedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);

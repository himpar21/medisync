const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema(
  {
    medicineId: {
      type: String,
      required: true,
      trim: true,
    },
    medicineName: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      default: "General",
      trim: true,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    lineTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    items: {
      type: [cartItemSchema],
      default: [],
    },
    totalItems: {
      type: Number,
      default: 0,
      min: 0,
    },
    subtotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      default: "INR",
      trim: true,
    },
    isLocked: {
      type: Boolean,
      default: false,
    },
    lockExpiresAt: {
      type: Date,
      default: new Date(0),
      index: true,
    },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
  }
);

cartSchema.methods.recalculate = function recalculate() {
  this.items = this.items.filter((item) => item.quantity > 0);
  this.items.forEach((item) => {
    item.lineTotal = Number((item.unitPrice * item.quantity).toFixed(2));
  });
  this.totalItems = this.items.reduce((sum, item) => sum + item.quantity, 0);
  this.subtotal = Number(
    this.items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2)
  );
};

module.exports = mongoose.model("Cart", cartSchema);

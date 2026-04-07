const mongoose = require("mongoose");

const paymentEventSchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    message: { type: String, default: "" },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const paymentSchema = new mongoose.Schema(
  {
    paymentNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    orderId: {
      type: String,
      required: true,
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
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "INR",
      trim: true,
    },
    method: {
      type: String,
      default: "stripe",
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "succeeded", "failed", "refunded"],
      default: "pending",
      index: true,
    },
    transactionRef: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    gatewayStatus: {
      type: String,
      default: "",
      trim: true,
    },
    message: {
      type: String,
      default: "",
      trim: true,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    orderPlacedAt: {
      type: Date,
      default: null,
      index: true,
    },
    stripePaymentIntentId: {
      type: String,
      default: "",
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    history: {
      type: [paymentEventSchema],
      default: [],
    },
  },
  { timestamps: true, optimisticConcurrency: true }
);

paymentSchema.index({ orderId: 1, userId: 1, createdAt: -1 });
paymentSchema.index({ status: 1, orderPlacedAt: 1, createdAt: 1 });
paymentSchema.index(
  { orderId: 1, userId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "pending" },
  }
);
paymentSchema.index(
  { stripePaymentIntentId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      stripePaymentIntentId: { $exists: true, $type: "string", $ne: "" },
    },
  }
);

paymentSchema.set("toJSON", {
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Payment", paymentSchema);

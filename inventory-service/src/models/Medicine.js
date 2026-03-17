const mongoose = require("mongoose");
const { summarizeMedicineBatches, syncMedicineInventoryFields } = require("../utils/batchUtils");

const reservationSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const batchSchema = new mongoose.Schema(
  {
    batchNo: {
      type: String,
      default: "",
      trim: true,
    },
    expiryDate: {
      type: Date,
      required: true,
    },
    stock: {
      type: Number,
      default: 0,
      min: 0,
    },
    reservedStock: {
      type: Number,
      default: 0,
      min: 0,
    },
    reservations: {
      type: [reservationSchema],
      default: [],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const medicineSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    prescriptionRequired: {
      type: Boolean,
      default: false,
      index: true,
    },
    uses: {
      type: String,
      default: "",
      trim: true,
    },
    dosage: {
      type: String,
      default: "",
      trim: true,
    },
    sideEffects: {
      type: String,
      default: "",
      trim: true,
    },
    warnings: {
      type: String,
      default: "",
      trim: true,
    },
    storageInstructions: {
      type: String,
      default: "",
      trim: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    manufacturer: {
      type: String,
      default: "Unknown",
      trim: true,
    },
    imageData: {
      type: String,
      default: "",
      trim: true,
      maxlength: 7 * 1024 * 1024,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    stock: {
      type: Number,
      default: 0,
      min: 0,
    },
    reservedStock: {
      type: Number,
      default: 0,
      min: 0,
    },
    lowStockThreshold: {
      type: Number,
      default: 10,
      min: 0,
    },
    expiryDate: {
      type: Date,
      required: true,
      index: true,
    },
    batchNo: {
      type: String,
      default: "",
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    reservations: {
      type: [reservationSchema],
      default: [],
    },
    batches: {
      type: [batchSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
  }
);

medicineSchema.virtual("availableStock").get(function getAvailableStock() {
  return summarizeMedicineBatches(this).availableStock;
});

medicineSchema.pre("validate", function preValidate(next) {
  syncMedicineInventoryFields(this);
  next();
});

medicineSchema.set("toJSON", {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id;
    const summary = summarizeMedicineBatches(ret);
    ret.stock = summary.stock;
    ret.reservedStock = summary.reservedStock;
    ret.availableStock = summary.availableStock;
    ret.expiryDate = summary.primaryBatch?.expiryDate || ret.expiryDate || null;
    ret.batchNo = summary.primaryBatch?.batchNo || ret.batchNo || "";
    ret.batches = summary.batches.map((batch) => ({
      batchNo: batch.batchNo,
      expiryDate: batch.expiryDate,
      stock: batch.stock,
      reservedStock: batch.reservedStock,
      availableStock: Math.max(0, Number(batch.stock || 0) - Number(batch.reservedStock || 0)),
    }));
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Medicine", medicineSchema);

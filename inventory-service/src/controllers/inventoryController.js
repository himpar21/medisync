const Medicine = require("../models/Medicine");
const cache = require("../config/redis");
const stockService = require("../services/stockService");
const {
  formatBatch,
  getMedicineBatches,
  summarizeMedicineBatches,
  syncMedicineInventoryFields,
  toSafeDate,
} = require("../utils/batchUtils");

const MEDICINE_LIST_CACHE_PREFIX = "inventory:medicine:list:";
const MEDICINE_ITEM_CACHE_PREFIX = "inventory:medicine:item:";
const MEDICINE_CATEGORY_CACHE_KEY = "inventory:medicine:categories";
const ALERT_CACHE_PREFIX = "inventory:alert:";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toPositiveInteger(value, fallback = 0) {
  const parsed = Math.floor(Number(value));
  return parsed > 0 ? parsed : fallback;
}

function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "yes" || normalized === "1") {
      return true;
    }
    if (normalized === "false" || normalized === "no" || normalized === "0") {
      return false;
    }
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  return fallback;
}

function normalizeImageData(imageData) {
  const normalized = String(imageData || "").trim();
  if (!normalized) {
    return "";
  }

  const isDataImage = normalized.startsWith("data:image/");
  if (!isDataImage) {
    return null;
  }

  const maxLength = 6 * 1024 * 1024;
  if (normalized.length > maxLength) {
    return null;
  }

  return normalized;
}

function buildListCacheKey(query, isPrivilegedViewer) {
  const q = String(query.q || "").trim().toLowerCase();
  const category = String(query.category || "").trim().toLowerCase();
  const includeInactive = String(query.includeInactive || "").trim().toLowerCase();
  const scope = isPrivilegedViewer ? "privileged" : "public";
  return `${MEDICINE_LIST_CACHE_PREFIX}${scope}|${q}|${category}|${includeInactive}`;
}

function formatMedicine(medicine) {
  const summary = summarizeMedicineBatches(medicine);

  return {
    id: medicine.id || String(medicine._id),
    _id: String(medicine._id),
    code: medicine.code,
    name: medicine.name,
    description: medicine.description || "",
    prescriptionRequired: Boolean(medicine.prescriptionRequired),
    uses: medicine.uses || "",
    dosage: medicine.dosage || "",
    sideEffects: medicine.sideEffects || "",
    warnings: medicine.warnings || "",
    storageInstructions: medicine.storageInstructions || "",
    category: medicine.category,
    manufacturer: medicine.manufacturer || "Unknown",
    imageData: medicine.imageData || "",
    price: toNumber(medicine.price, 0),
    stock: summary.stock,
    reservedStock: summary.reservedStock,
    availableStock: summary.availableStock,
    lowStockThreshold: toNumber(medicine.lowStockThreshold, 10),
    expiryDate: summary.primaryBatch?.expiryDate || medicine.expiryDate || null,
    batchNo: summary.primaryBatch?.batchNo || medicine.batchNo || "",
    batches: summary.batches.map(formatBatch),
    batchCount: summary.batches.length,
    isActive: Boolean(medicine.isActive),
    createdAt: medicine.createdAt,
    updatedAt: medicine.updatedAt,
  };
}

function applyMedicineMetadata(target, payload) {
  target.name = payload.name;
  target.description = payload.description;
  target.prescriptionRequired = payload.prescriptionRequired;
  target.uses = payload.uses;
  target.dosage = payload.dosage;
  target.sideEffects = payload.sideEffects;
  target.warnings = payload.warnings;
  target.storageInstructions = payload.storageInstructions;
  target.category = payload.category;
  target.manufacturer = payload.manufacturer;
  target.price = payload.price;
  target.lowStockThreshold = payload.lowStockThreshold;
  target.imageData = payload.imageData;
}

function isSameDay(left, right) {
  const leftDate = toSafeDate(left);
  const rightDate = toSafeDate(right);

  if (!leftDate || !rightDate) {
    return false;
  }

  return leftDate.toISOString().slice(0, 10) === rightDate.toISOString().slice(0, 10);
}

function mergeOrAppendBatch(existingMedicine, payload) {
  const nextBatches = getMedicineBatches(existingMedicine);
  const batchNo = String(payload.batchNo || "").trim();
  const expiryDate = toSafeDate(payload.expiryDate);

  if (!expiryDate) {
    throw new Error("expiryDate is required");
  }

  const duplicateIndex = nextBatches.findIndex((batch) => {
    if (batchNo) {
      return String(batch.batchNo || "").trim() === batchNo;
    }

    return !String(batch.batchNo || "").trim() && isSameDay(batch.expiryDate, expiryDate);
  });

  if (duplicateIndex >= 0) {
    const currentBatch = nextBatches[duplicateIndex];

    if (batchNo && currentBatch.expiryDate && !isSameDay(currentBatch.expiryDate, expiryDate)) {
      throw new Error("Existing batch number already uses a different expiry date");
    }

    currentBatch.stock = Math.max(0, Number(currentBatch.stock || 0)) + payload.stock;
    if (!currentBatch.expiryDate) {
      currentBatch.expiryDate = expiryDate;
    }
    nextBatches[duplicateIndex] = currentBatch;
  } else {
    nextBatches.push({
      batchNo,
      expiryDate,
      stock: payload.stock,
      reservedStock: 0,
      reservations: [],
      createdAt: new Date(),
    });
  }

  existingMedicine.batches = nextBatches;
  syncMedicineInventoryFields(existingMedicine);
  return existingMedicine;
}

async function clearInventoryCaches() {
  await Promise.all([
    cache.delByPrefix(MEDICINE_LIST_CACHE_PREFIX),
    cache.delByPrefix(MEDICINE_ITEM_CACHE_PREFIX),
    cache.delKey(MEDICINE_CATEGORY_CACHE_KEY),
    cache.delByPrefix(ALERT_CACHE_PREFIX),
  ]);
}

function hasAdminAccess(req) {
  return ["admin", "pharmacist"].includes(req.user?.role);
}

exports.listMedicines = async (req, res) => {
  const isPrivilegedViewer = hasAdminAccess(req);
  const cacheKey = buildListCacheKey(req.query, isPrivilegedViewer);
  const cached = await cache.getJSON(cacheKey);
  if (cached) {
    return res.status(200).json(cached);
  }

  const query = {};
  const searchQuery = String(req.query.q || "").trim();
  const categoryQuery = String(req.query.category || "").trim();
  const includeInactive = String(req.query.includeInactive || "").trim().toLowerCase() === "true";

  if (!(includeInactive && isPrivilegedViewer)) {
    query.isActive = true;
  }

  if (searchQuery) {
    const regex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    query.$or = [{ name: regex }, { code: regex }];
  }

  if (categoryQuery) {
    query.category = categoryQuery;
  }

  const medicines = await Medicine.find(query).sort({ name: 1 }).lean();
  const payload = {
    items: medicines.map(formatMedicine),
  };

  await cache.setJSON(cacheKey, payload, 45);
  res.status(200).json(payload);
};

exports.listCategories = async (req, res) => {
  const cached = await cache.getJSON(MEDICINE_CATEGORY_CACHE_KEY);
  if (cached) {
    return res.status(200).json(cached);
  }

  const categories = await Medicine.distinct("category", { isActive: true });
  categories.sort((a, b) => a.localeCompare(b));

  const payload = { items: categories };
  await cache.setJSON(MEDICINE_CATEGORY_CACHE_KEY, payload, 300);
  res.status(200).json(payload);
};

exports.getMedicineById = async (req, res) => {
  const medicineId = String(req.params.medicineId || "").trim();
  if (!medicineId) {
    return res.status(400).json({ message: "medicineId is required" });
  }

  const cacheKey = `${MEDICINE_ITEM_CACHE_PREFIX}${hasAdminAccess(req) ? "privileged" : "public"}:${medicineId}`;
  const cached = await cache.getJSON(cacheKey);
  if (cached) {
    return res.status(200).json(cached);
  }

  const medicine = await Medicine.findById(medicineId).lean();
  if (!medicine || (!medicine.isActive && !hasAdminAccess(req))) {
    return res.status(404).json({ message: "Medicine not found" });
  }

  const payload = { medicine: formatMedicine(medicine) };
  await cache.setJSON(cacheKey, payload, 120);
  return res.status(200).json(payload);
};

exports.createMedicine = async (req, res) => {
  const payload = {
    code: String(req.body.code || "").trim().toUpperCase(),
    name: String(req.body.name || "").trim(),
    description: String(req.body.description || "").trim(),
    prescriptionRequired: toBoolean(req.body.prescriptionRequired, false),
    uses: String(req.body.uses || "").trim(),
    dosage: String(req.body.dosage || "").trim(),
    sideEffects: String(req.body.sideEffects || "").trim(),
    warnings: String(req.body.warnings || "").trim(),
    storageInstructions: String(req.body.storageInstructions || "").trim(),
    category: String(req.body.category || "").trim(),
    manufacturer: String(req.body.manufacturer || "Unknown").trim(),
    price: toNumber(req.body.price, -1),
    stock: toNumber(req.body.stock, 0),
    lowStockThreshold: toNumber(req.body.lowStockThreshold, 10),
    expiryDate: req.body.expiryDate,
    batchNo: String(req.body.batchNo || "").trim(),
    imageData: normalizeImageData(req.body.imageData),
  };

  if (!payload.code || !payload.name || !payload.category || payload.price < 0) {
    return res.status(400).json({
      message: "code, name, category and non-negative price are required",
    });
  }

  if (payload.stock < 0) {
    return res.status(400).json({ message: "stock cannot be negative" });
  }

  if (!payload.expiryDate) {
    return res.status(400).json({ message: "expiryDate is required" });
  }

  if (payload.imageData === null) {
    return res.status(400).json({
      message: "imageData must be a valid image data URL and smaller than 6MB",
    });
  }

  const existingMedicine = await Medicine.findOne({ code: payload.code });

  if (existingMedicine) {
    if (
      String(existingMedicine.name || "").trim().toLowerCase() !== payload.name.toLowerCase()
    ) {
      return res.status(409).json({
        message: "This medicine code is already linked to a different medicine name",
      });
    }

    try {
      mergeOrAppendBatch(existingMedicine, payload);
    } catch (error) {
      return res.status(400).json({ message: error.message || "Unable to add batch" });
    }

    await existingMedicine.save();
    await clearInventoryCaches();

    return res.status(201).json({
      message: "Medicine batch added successfully",
      medicine: formatMedicine(existingMedicine.toJSON()),
    });
  }

  const medicine = new Medicine({
    ...payload,
    reservedStock: 0,
    reservations: [],
    batches: [
      {
        batchNo: payload.batchNo,
        expiryDate: payload.expiryDate,
        stock: payload.stock,
        reservedStock: 0,
        reservations: [],
        createdAt: new Date(),
      },
    ],
  });
  applyMedicineMetadata(medicine, payload);
  syncMedicineInventoryFields(medicine);
  await medicine.save();
  await clearInventoryCaches();

  return res.status(201).json({
    message: "Medicine created successfully",
    medicine: formatMedicine(medicine.toJSON()),
  });
};

exports.updateMedicine = async (req, res) => {
  const medicineId = String(req.params.medicineId || "").trim();
  if (!medicineId) {
    return res.status(400).json({ message: "medicineId is required" });
  }

  const existingMedicine = await Medicine.findById(medicineId);
  if (!existingMedicine) {
    return res.status(404).json({ message: "Medicine not found" });
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "price")) {
    const nextPrice = toNumber(req.body.price, -1);
    if (nextPrice < 0) {
      return res.status(400).json({ message: "price cannot be negative" });
    }
    existingMedicine.price = nextPrice;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "stock")) {
    const nextStock = toNumber(req.body.stock, -1);
    if (nextStock < 0) {
      return res.status(400).json({ message: "stock cannot be negative" });
    }
    const summary = summarizeMedicineBatches(existingMedicine);
    if (nextStock < summary.reservedStock) {
      return res.status(400).json({
        message: `stock cannot be less than reserved stock (${summary.reservedStock})`,
      });
    }

    const batches = getMedicineBatches(existingMedicine);
    const targetBatch = batches[batches.length - 1];

    if (!targetBatch) {
      return res.status(400).json({
        message: "Cannot update stock without at least one batch. Add a new batch first.",
      });
    }

    const delta = nextStock - summary.stock;
    targetBatch.stock = Math.max(targetBatch.reservedStock, targetBatch.stock + delta);
    existingMedicine.batches = batches;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "lowStockThreshold")) {
    existingMedicine.lowStockThreshold = Math.max(0, toNumber(req.body.lowStockThreshold, 10));
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "code")) {
    const nextCode = String(req.body.code || "").trim().toUpperCase();
    const conflictingCode = await Medicine.findOne({
      _id: { $ne: existingMedicine._id },
      code: nextCode,
    }).lean();

    if (conflictingCode) {
      return res.status(409).json({ message: "code is already in use" });
    }

    existingMedicine.code = nextCode;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "prescriptionRequired")) {
    existingMedicine.prescriptionRequired = toBoolean(
      req.body.prescriptionRequired,
      Boolean(existingMedicine.prescriptionRequired)
    );
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "imageData")) {
    const nextImageData = normalizeImageData(req.body.imageData);
    if (nextImageData === null) {
      return res.status(400).json({
        message: "imageData must be a valid image data URL and smaller than 6MB",
      });
    }
    existingMedicine.imageData = nextImageData;
  }

  [
    "name",
    "description",
    "uses",
    "dosage",
    "sideEffects",
    "warnings",
    "storageInstructions",
    "category",
    "manufacturer",
    "isActive",
  ].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      existingMedicine[field] = req.body[field];
    }
  });

  const requestTouchesBatchMetadata =
    Object.prototype.hasOwnProperty.call(req.body, "batchNo") ||
    Object.prototype.hasOwnProperty.call(req.body, "expiryDate");

  if (requestTouchesBatchMetadata) {
    const batches = getMedicineBatches(existingMedicine);

    if (batches.length > 1) {
      return res.status(400).json({
        message: "Batch expiry or batch number cannot be edited on a medicine with multiple batches",
      });
    }

    const targetBatch = batches[0];
    if (!targetBatch) {
      return res.status(400).json({ message: "No batch exists for this medicine" });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "batchNo")) {
      targetBatch.batchNo = String(req.body.batchNo || "").trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "expiryDate")) {
      const nextExpiryDate = toSafeDate(req.body.expiryDate);
      if (!nextExpiryDate) {
        return res.status(400).json({ message: "expiryDate is required" });
      }
      targetBatch.expiryDate = nextExpiryDate;
    }

    existingMedicine.batches = batches;
  }

  syncMedicineInventoryFields(existingMedicine);
  await existingMedicine.save();

  await clearInventoryCaches();
  return res.status(200).json({
    message: "Medicine updated successfully",
    medicine: formatMedicine(existingMedicine.toJSON()),
  });
};

exports.deleteMedicine = async (req, res) => {
  const medicineId = String(req.params.medicineId || "").trim();
  if (!medicineId) {
    return res.status(400).json({ message: "medicineId is required" });
  }

  const deleted = await Medicine.findByIdAndDelete(medicineId);
  if (!deleted) {
    return res.status(404).json({ message: "Medicine not found" });
  }

  await clearInventoryCaches();
  return res.status(200).json({
    message: "Medicine deleted successfully",
  });
};

exports.adjustStock = async (req, res) => {
  const medicineId = String(req.params.medicineId || "").trim();
  const mode = String(req.body.mode || "set").trim().toLowerCase();
  const quantity = Math.floor(toNumber(req.body.quantity, -1));

  if (!medicineId || quantity < 0) {
    return res.status(400).json({ message: "Valid medicineId and quantity are required" });
  }

  const medicine = await Medicine.findById(medicineId);
  if (!medicine) {
    return res.status(404).json({ message: "Medicine not found" });
  }

  const batches = getMedicineBatches(medicine);
  const summary = summarizeMedicineBatches(medicine);

  if (!batches.length) {
    return res.status(400).json({ message: "No batch exists for this medicine" });
  }

  if (mode === "set") {
    if (quantity < summary.reservedStock) {
      return res.status(400).json({
        message: `Stock cannot be set below reservedStock (${summary.reservedStock})`,
      });
    }

    const lastBatch = batches[batches.length - 1];
    const delta = quantity - summary.stock;
    lastBatch.stock = Math.max(lastBatch.reservedStock, lastBatch.stock + delta);
  } else if (mode === "add") {
    const lastBatch = batches[batches.length - 1];
    lastBatch.stock += quantity;
  } else if (mode === "subtract") {
    const available = summary.availableStock;
    if (quantity > available) {
      return res.status(409).json({
        message: "Cannot reduce stock below reserved quantity",
      });
    }

    let remaining = quantity;
    for (let index = batches.length - 1; index >= 0 && remaining > 0; index -= 1) {
      const batch = batches[index];
      const batchAvailable = Math.max(0, Number(batch.stock || 0) - Number(batch.reservedStock || 0));
      const deduction = Math.min(batchAvailable, remaining);
      if (!deduction) {
        continue;
      }
      batch.stock -= deduction;
      remaining -= deduction;
    }
  } else {
    return res.status(400).json({ message: "mode must be one of: set, add, subtract" });
  }

  medicine.batches = batches;
  syncMedicineInventoryFields(medicine);
  await medicine.save();
  await clearInventoryCaches();

  return res.status(200).json({
    message: "Stock updated successfully",
    medicine: formatMedicine(medicine.toJSON()),
  });
};

exports.verifyStock = async (req, res) => {
  const result = await stockService.verifyStock(req.body.items);
  return res.status(200).json(result);
};

exports.reserveStock = async (req, res) => {
  const result = await stockService.reserveStock(req.body.items, req.body.reference);
  if (!result.ok) {
    return res.status(409).json(result);
  }

  await clearInventoryCaches();
  return res.status(200).json({
    ok: true,
    message: "Stock reserved successfully",
  });
};

exports.releaseStock = async (req, res) => {
  await stockService.releaseStock(req.body.items, req.body.reference);
  await clearInventoryCaches();
  return res.status(200).json({
    ok: true,
    message: "Reserved stock released",
  });
};

exports.deductStock = async (req, res) => {
  const result = await stockService.deductStock(req.body.items, req.body.reference);
  if (!result.ok) {
    return res.status(409).json(result);
  }

  await clearInventoryCaches();
  return res.status(200).json({
    ok: true,
    message: "Stock deducted successfully",
  });
};

exports.lowStockAlerts = async (req, res) => {
  const explicitThreshold = toPositiveInteger(req.query.threshold, 0);
  const cacheKey = `${ALERT_CACHE_PREFIX}low:${explicitThreshold}`;
  const cached = await cache.getJSON(cacheKey);
  if (cached) {
    return res.status(200).json(cached);
  }

  const medicines = await Medicine.find({ isActive: true }).sort({ name: 1 }).lean();
  const items = medicines
    .map(formatMedicine)
    .filter((medicine) => medicine.availableStock <= (explicitThreshold || medicine.lowStockThreshold));

  const payload = {
    items,
    total: items.length,
  };
  await cache.setJSON(cacheKey, payload, 30);
  return res.status(200).json(payload);
};

exports.expiryAlerts = async (req, res) => {
  const days = toPositiveInteger(req.query.days, 30);
  const cacheKey = `${ALERT_CACHE_PREFIX}expiry:${days}`;
  const cached = await cache.getJSON(cacheKey);
  if (cached) {
    return res.status(200).json(cached);
  }

  const now = new Date();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);

  const medicines = await Medicine.find({ isActive: true }).sort({ name: 1 }).lean();

  const items = medicines
    .flatMap((medicine) => {
      const formattedMedicine = formatMedicine(medicine);

      return formattedMedicine.batches
        .filter((batch) => {
          if (!batch.expiryDate || batch.availableStock <= 0) {
            return false;
          }

          const batchExpiry = new Date(batch.expiryDate);
          return batchExpiry >= now && batchExpiry <= cutoff;
        })
        .map((batch) => ({
          ...formattedMedicine,
          expiryDate: batch.expiryDate,
          batchNo: batch.batchNo || formattedMedicine.batchNo || "",
          batchAvailableStock: batch.availableStock,
          batchStock: batch.stock,
          daysToExpiry: Math.max(
            0,
            Math.ceil((new Date(batch.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          ),
        }));
    })
    .sort((left, right) => new Date(left.expiryDate).getTime() - new Date(right.expiryDate).getTime());

  const payload = {
    items,
    total: items.length,
  };

  await cache.setJSON(cacheKey, payload, 45);
  return res.status(200).json(payload);
};

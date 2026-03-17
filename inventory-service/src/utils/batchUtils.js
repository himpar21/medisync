function toWholeNumber(value, fallback = 0) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toSafeDate(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeReservation(reservation) {
  const quantity = Math.max(0, toWholeNumber(reservation?.quantity, 0));
  if (!quantity) {
    return null;
  }

  return {
    reference: String(reservation?.reference || "").trim(),
    quantity,
    createdAt: toSafeDate(reservation?.createdAt) || new Date(),
  };
}

function normalizeReservations(reservations) {
  if (!Array.isArray(reservations)) {
    return [];
  }

  return reservations.map(normalizeReservation).filter(Boolean);
}

function buildLegacyBatch(medicine) {
  const stock = Math.max(0, toWholeNumber(medicine?.stock, 0));
  const reservedStock = Math.max(0, Math.min(stock, toWholeNumber(medicine?.reservedStock, 0)));
  const expiryDate = toSafeDate(medicine?.expiryDate);
  const reservations = normalizeReservations(medicine?.reservations);

  if (!stock && !reservedStock && !expiryDate && !String(medicine?.batchNo || "").trim()) {
    return null;
  }

  return {
    batchNo: String(medicine?.batchNo || "").trim(),
    expiryDate,
    stock,
    reservedStock,
    reservations,
    createdAt: toSafeDate(medicine?.createdAt) || new Date(),
  };
}

function normalizeBatch(batch) {
  const stock = Math.max(0, toWholeNumber(batch?.stock, 0));
  const reservedStock = Math.max(0, Math.min(stock, toWholeNumber(batch?.reservedStock, 0)));

  return {
    batchNo: String(batch?.batchNo || "").trim(),
    expiryDate: toSafeDate(batch?.expiryDate),
    stock,
    reservedStock,
    reservations: normalizeReservations(batch?.reservations),
    createdAt: toSafeDate(batch?.createdAt) || new Date(),
  };
}

function sortBatchesByExpiry(batches) {
  return [...batches].sort((left, right) => {
    const leftTime = left.expiryDate ? new Date(left.expiryDate).getTime() : Number.MAX_SAFE_INTEGER;
    const rightTime = right.expiryDate ? new Date(right.expiryDate).getTime() : Number.MAX_SAFE_INTEGER;

    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    return String(left.batchNo || "").localeCompare(String(right.batchNo || ""));
  });
}

function getMedicineBatches(medicine) {
  const rawBatches =
    Array.isArray(medicine?.batches) && medicine.batches.length
      ? medicine.batches
      : [buildLegacyBatch(medicine)].filter(Boolean);

  return sortBatchesByExpiry(
    rawBatches
      .map(normalizeBatch)
      .filter(
        (batch) =>
          batch.stock > 0 ||
          batch.reservedStock > 0 ||
          batch.reservations.length > 0 ||
          batch.expiryDate ||
          batch.batchNo
      )
  );
}

function aggregateReservations(batches) {
  const reservationMap = new Map();

  batches.forEach((batch) => {
    batch.reservations.forEach((reservation) => {
      const key = String(reservation.reference || "").trim();
      if (!key) {
        return;
      }

      const existing = reservationMap.get(key);
      if (existing) {
        existing.quantity += reservation.quantity;
        if (reservation.createdAt < existing.createdAt) {
          existing.createdAt = reservation.createdAt;
        }
        return;
      }

      reservationMap.set(key, {
        reference: key,
        quantity: reservation.quantity,
        createdAt: reservation.createdAt,
      });
    });
  });

  return [...reservationMap.values()].sort((left, right) => left.createdAt - right.createdAt);
}

function summarizeMedicineBatches(medicine) {
  const batches = getMedicineBatches(medicine);
  const stock = batches.reduce((sum, batch) => sum + batch.stock, 0);
  const reservedStock = batches.reduce((sum, batch) => sum + batch.reservedStock, 0);
  const availableStock = Math.max(0, stock - reservedStock);
  const batchesWithAvailableStock = batches.filter(
    (batch) => Math.max(0, batch.stock - batch.reservedStock) > 0
  );
  const primaryBatch = batchesWithAvailableStock[0] || batches[0] || null;

  return {
    batches,
    stock,
    reservedStock,
    availableStock,
    primaryBatch,
    reservations: aggregateReservations(batches),
  };
}

function syncMedicineInventoryFields(medicine) {
  const summary = summarizeMedicineBatches(medicine);

  medicine.batches = summary.batches.map((batch) => ({
    batchNo: batch.batchNo,
    expiryDate: batch.expiryDate,
    stock: batch.stock,
    reservedStock: batch.reservedStock,
    reservations: batch.reservations.map((reservation) => ({
      reference: reservation.reference,
      quantity: reservation.quantity,
      createdAt: reservation.createdAt,
    })),
    createdAt: batch.createdAt,
  }));
  medicine.stock = summary.stock;
  medicine.reservedStock = summary.reservedStock;
  medicine.expiryDate = summary.primaryBatch?.expiryDate || medicine.expiryDate || undefined;
  medicine.batchNo = summary.primaryBatch?.batchNo || "";
  medicine.reservations = summary.reservations.map((reservation) => ({
    reference: reservation.reference,
    quantity: reservation.quantity,
    createdAt: reservation.createdAt,
  }));

  return medicine;
}

function formatBatch(batch) {
  const availableStock = Math.max(0, Number(batch.stock || 0) - Number(batch.reservedStock || 0));

  return {
    batchNo: String(batch.batchNo || "").trim(),
    expiryDate: batch.expiryDate || null,
    stock: Math.max(0, toWholeNumber(batch.stock, 0)),
    reservedStock: Math.max(0, toWholeNumber(batch.reservedStock, 0)),
    availableStock,
  };
}

module.exports = {
  formatBatch,
  getMedicineBatches,
  summarizeMedicineBatches,
  syncMedicineInventoryFields,
  toSafeDate,
  toWholeNumber,
};

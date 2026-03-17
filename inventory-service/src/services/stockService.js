const Medicine = require("../models/Medicine");
const { getMedicineBatches, summarizeMedicineBatches, syncMedicineInventoryFields } = require("../utils/batchUtils");

function normalizeItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  const quantityByMedicineId = new Map();

  items.forEach((item) => {
    const medicineId = String(item?.medicineId || "").trim();
    const quantity = Math.floor(Number(item?.quantity || 0));

    if (!medicineId || quantity <= 0) {
      return;
    }

    quantityByMedicineId.set(medicineId, (quantityByMedicineId.get(medicineId) || 0) + quantity);
  });

  return [...quantityByMedicineId.entries()].map(([medicineId, quantity]) => ({
    medicineId,
    quantity,
  }));
}

function buildUnavailableEntry(medicineId, requested, available, reason) {
  return {
    medicineId,
    requested,
    available: Math.max(0, Number(available || 0)),
    reason,
  };
}

function cloneBatches(medicine) {
  return getMedicineBatches(medicine).map((batch) => ({
    batchNo: batch.batchNo,
    expiryDate: batch.expiryDate,
    stock: batch.stock,
    reservedStock: batch.reservedStock,
    reservations: (batch.reservations || []).map((reservation) => ({
      reference: reservation.reference,
      quantity: reservation.quantity,
      createdAt: reservation.createdAt,
    })),
    createdAt: batch.createdAt,
  }));
}

async function rollbackSnapshots(snapshots) {
  for (const snapshot of [...snapshots].reverse()) {
    const medicine = await Medicine.findById(snapshot.medicineId);
    if (!medicine) {
      continue;
    }

    medicine.batches = snapshot.batches.map((batch) => ({
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
    syncMedicineInventoryFields(medicine);
    await medicine.save();
  }
}

function getReservedQuantityForReference(batches, reference) {
  const referenceKey = String(reference || "").trim();
  if (!referenceKey) {
    return 0;
  }

  return batches.reduce(
    (sum, batch) =>
      sum +
      (batch.reservations || []).reduce((batchSum, reservation) => {
        if (String(reservation.reference || "").trim() !== referenceKey) {
          return batchSum;
        }

        return batchSum + Number(reservation.quantity || 0);
      }, 0),
    0
  );
}

function reserveAcrossBatches(batches, quantity, reference) {
  let remaining = quantity;

  for (const batch of batches) {
    if (remaining <= 0) {
      break;
    }

    const availableInBatch = Math.max(0, Number(batch.stock || 0) - Number(batch.reservedStock || 0));
    const reservedNow = Math.min(availableInBatch, remaining);

    if (!reservedNow) {
      continue;
    }

    batch.reservedStock += reservedNow;

    const reservationIndex = (batch.reservations || []).findIndex(
      (reservation) => String(reservation.reference || "").trim() === reference
    );

    if (reservationIndex >= 0) {
      batch.reservations[reservationIndex].quantity += reservedNow;
    } else {
      batch.reservations.push({
        reference,
        quantity: reservedNow,
        createdAt: new Date(),
      });
    }

    remaining -= reservedNow;
  }

  return quantity - remaining;
}

function releaseReservationFromBatch(batch, requestedQuantity, reference) {
  let remaining = requestedQuantity;
  const nextReservations = [];

  (batch.reservations || []).forEach((reservation) => {
    const reservationReference = String(reservation.reference || "").trim();

    if (remaining <= 0 || (reference && reservationReference !== reference)) {
      nextReservations.push(reservation);
      return;
    }

    const currentQuantity = Math.max(0, Number(reservation.quantity || 0));
    const released = Math.min(currentQuantity, remaining);
    const leftover = currentQuantity - released;

    if (leftover > 0) {
      nextReservations.push({
        reference: reservationReference,
        quantity: leftover,
        createdAt: reservation.createdAt,
      });
    }

    batch.reservedStock = Math.max(0, Number(batch.reservedStock || 0) - released);
    remaining -= released;
  });

  batch.reservations = nextReservations;
  return requestedQuantity - remaining;
}

function deductReservedFromBatch(batch, requestedQuantity, reference) {
  let remaining = requestedQuantity;
  const nextReservations = [];

  (batch.reservations || []).forEach((reservation) => {
    const reservationReference = String(reservation.reference || "").trim();

    if (remaining <= 0 || reservationReference !== reference) {
      nextReservations.push(reservation);
      return;
    }

    const currentQuantity = Math.max(0, Number(reservation.quantity || 0));
    const deducted = Math.min(currentQuantity, remaining);
    const leftover = currentQuantity - deducted;

    if (leftover > 0) {
      nextReservations.push({
        reference: reservationReference,
        quantity: leftover,
        createdAt: reservation.createdAt,
      });
    }

    batch.reservedStock = Math.max(0, Number(batch.reservedStock || 0) - deducted);
    batch.stock = Math.max(0, Number(batch.stock || 0) - deducted);
    remaining -= deducted;
  });

  batch.reservations = nextReservations;
  return requestedQuantity - remaining;
}

function deductAvailableFromBatches(batches, quantity) {
  let remaining = quantity;

  for (const batch of batches) {
    if (remaining <= 0) {
      break;
    }

    const availableInBatch = Math.max(0, Number(batch.stock || 0) - Number(batch.reservedStock || 0));
    const deducted = Math.min(availableInBatch, remaining);

    if (!deducted) {
      continue;
    }

    batch.stock -= deducted;
    remaining -= deducted;
  }

  return quantity - remaining;
}

async function verifyStock(items) {
  const normalizedItems = normalizeItems(items);
  if (!normalizedItems.length) {
    return { ok: true, unavailable: [] };
  }

  const medicineIds = [...new Set(normalizedItems.map((item) => item.medicineId))];
  const medicines = await Medicine.find({
    _id: { $in: medicineIds },
    isActive: true,
  }).lean();

  const medicineMap = new Map(medicines.map((medicine) => [String(medicine._id), medicine]));
  const unavailable = [];

  normalizedItems.forEach((item) => {
    const medicine = medicineMap.get(item.medicineId);
    if (!medicine) {
      unavailable.push(buildUnavailableEntry(item.medicineId, item.quantity, 0, "not_found"));
      return;
    }

    const summary = summarizeMedicineBatches(medicine);
    if (summary.availableStock < item.quantity) {
      unavailable.push(
        buildUnavailableEntry(
          item.medicineId,
          item.quantity,
          summary.availableStock,
          "insufficient_stock"
        )
      );
    }
  });

  return {
    ok: unavailable.length === 0,
    unavailable,
  };
}

async function reserveStock(items, reference) {
  const normalizedItems = normalizeItems(items);
  const reservationReference = String(reference || "").trim();

  if (!normalizedItems.length) {
    return { ok: true };
  }

  if (!reservationReference) {
    return { ok: false, message: "reference is required for stock reservation" };
  }

  const snapshots = [];

  try {
    for (const item of normalizedItems) {
      const medicine = await Medicine.findById(item.medicineId);
      if (!medicine || !medicine.isActive) {
        await rollbackSnapshots(snapshots);
        return { ok: false, message: `Insufficient stock for medicine ${item.medicineId}` };
      }

      const batches = getMedicineBatches(medicine);
      const summary = summarizeMedicineBatches({ batches });
      if (summary.availableStock < item.quantity) {
        await rollbackSnapshots(snapshots);
        return { ok: false, message: `Insufficient stock for medicine ${item.medicineId}` };
      }

      snapshots.push({
        medicineId: item.medicineId,
        batches: cloneBatches(medicine),
      });

      reserveAcrossBatches(batches, item.quantity, reservationReference);
      medicine.batches = batches;
      syncMedicineInventoryFields(medicine);
      await medicine.save();
    }
  } catch (error) {
    await rollbackSnapshots(snapshots);
    throw error;
  }

  return { ok: true };
}

async function releaseStock(items, reference) {
  const normalizedItems = normalizeItems(items);
  const reservationReference = String(reference || "").trim();

  for (const item of normalizedItems) {
    const medicine = await Medicine.findById(item.medicineId);
    if (!medicine) {
      continue;
    }

    const batches = getMedicineBatches(medicine);
    let remaining = item.quantity;

    if (reservationReference) {
      for (const batch of batches) {
        if (remaining <= 0) {
          break;
        }

        remaining -= releaseReservationFromBatch(batch, remaining, reservationReference);
      }
    }

    if (remaining > 0) {
      for (const batch of batches) {
        if (remaining <= 0) {
          break;
        }

        remaining -= releaseReservationFromBatch(batch, remaining, "");
      }
    }

    medicine.batches = batches;
    syncMedicineInventoryFields(medicine);
    await medicine.save();
  }

  return { ok: true };
}

async function deductStock(items, reference) {
  const normalizedItems = normalizeItems(items);
  const reservationReference = String(reference || "").trim();

  if (!normalizedItems.length) {
    return { ok: true };
  }

  const snapshots = [];

  try {
    for (const item of normalizedItems) {
      const medicine = await Medicine.findById(item.medicineId);
      if (!medicine || !medicine.isActive) {
        await rollbackSnapshots(snapshots);
        return { ok: false, message: `Medicine ${item.medicineId} not found` };
      }

      const batches = getMedicineBatches(medicine);
      const summary = summarizeMedicineBatches({ batches });
      const reservedForReference = getReservedQuantityForReference(batches, reservationReference);
      const totalDeliverable = summary.availableStock + reservedForReference;

      if (totalDeliverable < item.quantity) {
        await rollbackSnapshots(snapshots);
        return {
          ok: false,
          message: `Insufficient stock for medicine ${item.medicineId}`,
          unavailable: [
            buildUnavailableEntry(
              item.medicineId,
              item.quantity,
              totalDeliverable,
              "insufficient_stock"
            ),
          ],
        };
      }

      snapshots.push({
        medicineId: item.medicineId,
        batches: cloneBatches(medicine),
      });

      let remaining = item.quantity;

      if (reservationReference) {
        for (const batch of batches) {
          if (remaining <= 0) {
            break;
          }

          remaining -= deductReservedFromBatch(batch, remaining, reservationReference);
        }
      }

      if (remaining > 0) {
        remaining -= deductAvailableFromBatches(batches, remaining);
      }

      if (remaining > 0) {
        await rollbackSnapshots(snapshots);
        return {
          ok: false,
          message: `Insufficient stock for medicine ${item.medicineId}`,
          unavailable: [
            buildUnavailableEntry(
              item.medicineId,
              item.quantity,
              totalDeliverable - remaining,
              "insufficient_stock"
            ),
          ],
        };
      }

      medicine.batches = batches;
      syncMedicineInventoryFields(medicine);
      await medicine.save();
    }
  } catch (error) {
    await rollbackSnapshots(snapshots);
    throw error;
  }

  return { ok: true };
}

module.exports = {
  deductStock,
  normalizeItems,
  releaseStock,
  reserveStock,
  verifyStock,
};

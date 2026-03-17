const axios = require("axios");

const INVENTORY_URL = process.env.INVENTORY_SERVICE_URL || "http://127.0.0.1:5002";

const inventoryApi = axios.create({
  baseURL: INVENTORY_URL,
  timeout: 5000,
});

function normalizeRemoteMedicines(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  if (Array.isArray(payload?.medicines)) {
    return payload.medicines;
  }

  return [];
}

function buildInventoryError(error, operation) {
  const upstreamStatus = error?.response?.status;
  const upstreamMessage =
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    "Inventory service unavailable";

  const serviceError = new Error(`Inventory service ${operation} failed: ${upstreamMessage}`);
  serviceError.statusCode = Number.isInteger(upstreamStatus) ? upstreamStatus : 502;
  return serviceError;
}

async function fetchMedicines(filters = {}) {
  try {
    const response = await inventoryApi.get("/api/inventory/medicines", {
      params: filters,
    });
    return normalizeRemoteMedicines(response.data);
  } catch (error) {
    throw buildInventoryError(error, "fetch");
  }
}

async function getMedicineById(medicineId) {
  try {
    const response = await inventoryApi.get(`/api/inventory/medicines/${medicineId}`);
    return response.data?.medicine || response.data || null;
  } catch (error) {
    if (error?.response?.status === 404) {
      return null;
    }
    throw buildInventoryError(error, "lookup");
  }
}

async function verifyStock(items) {
  const payload = {
    items: items.map((item) => ({
      medicineId: item.medicineId,
      quantity: item.quantity,
    })),
  };

  try {
    const response = await inventoryApi.post("/api/inventory/stock/verify", payload);
    if (typeof response.data?.ok === "boolean") {
      return response.data;
    }
    return { ok: true, unavailable: [] };
  } catch (error) {
    throw buildInventoryError(error, "stock verification");
  }
}

async function reserveStock(items, reference) {
  const payload = {
    reference,
    items: items.map((item) => ({
      medicineId: item.medicineId,
      quantity: item.quantity,
    })),
  };

  try {
    await inventoryApi.post("/api/inventory/stock/reserve", payload);
    return { ok: true };
  } catch (reserveError) {
    try {
      await inventoryApi.post("/api/inventory/stock/deduct", payload);
      return { ok: true };
    } catch (_deductError) {
      throw buildInventoryError(reserveError, "stock reservation");
    }
  }
}

async function releaseStock(items, reference) {
  const payload = {
    reference,
    items: items.map((item) => ({
      medicineId: item.medicineId,
      quantity: item.quantity,
    })),
  };

  try {
    await inventoryApi.post("/api/inventory/stock/release", payload);
    return { ok: true };
  } catch (error) {
    throw buildInventoryError(error, "stock release");
  }
}

module.exports = {
  fetchMedicines,
  getMedicineById,
  verifyStock,
  reserveStock,
  releaseStock,
};

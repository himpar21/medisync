const { createHttpClient } = require("./httpClient");
const cache = require("./cache");

const INVENTORY_URL = process.env.INVENTORY_SERVICE_URL || "http://127.0.0.1:5002";
const INVENTORY_CACHE_TTL_SECONDS = Math.max(
  5,
  Number(process.env.INVENTORY_CACHE_TTL_SECONDS || 15)
);

const inventoryApi = createHttpClient({
  baseURL: INVENTORY_URL,
  timeout: Number(process.env.INVENTORY_TIMEOUT_MS || 5000),
  serviceName: "inventory-service",
});

const MEDICINE_LIST_CACHE_PREFIX = "inventory:list:";
const MEDICINE_ITEM_CACHE_PREFIX = "inventory:item:";

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

function normalizeFilterKey(filters = {}) {
  const q = String(filters.q || "").trim().toLowerCase();
  const category = String(filters.category || "").trim().toLowerCase();
  return `${q}|${category}`;
}

async function clearInventoryReadCache() {
  await Promise.all([
    cache.delByPrefix(MEDICINE_LIST_CACHE_PREFIX),
    cache.delByPrefix(MEDICINE_ITEM_CACHE_PREFIX),
  ]);
}

async function fetchMedicines(filters = {}) {
  const cacheKey = `${MEDICINE_LIST_CACHE_PREFIX}${normalizeFilterKey(filters)}`;
  const cached = await cache.getJSON(cacheKey);
  if (cached) {
    return cached;
  }

  const response = await inventoryApi.request(
    {
      method: "GET",
      url: "/api/inventory/medicines",
      params: filters,
    },
    {
      maxRetries: 2,
    }
  );

  const medicines = normalizeRemoteMedicines(response.data);
  await cache.setJSON(cacheKey, medicines, INVENTORY_CACHE_TTL_SECONDS);
  return medicines;
}

async function getMedicineById(medicineId) {
  const key = String(medicineId || "").trim();
  if (!key) {
    return null;
  }

  const cacheKey = `${MEDICINE_ITEM_CACHE_PREFIX}${key}`;
  const cached = await cache.getJSON(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const response = await inventoryApi.request(
      {
        method: "GET",
        url: `/api/inventory/medicines/${key}`,
      },
      {
        maxRetries: 2,
      }
    );
    const medicine = response.data?.medicine || response.data || null;
    if (medicine) {
      await cache.setJSON(cacheKey, medicine, INVENTORY_CACHE_TTL_SECONDS);
    }
    return medicine;
  } catch (error) {
    if (error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

async function verifyStock(items) {
  const payload = {
    items: items.map((item) => ({
      medicineId: item.medicineId,
      quantity: item.quantity,
    })),
  };

  const response = await inventoryApi.request(
    {
      method: "POST",
      url: "/api/inventory/stock/verify",
      data: payload,
    },
    {
      maxRetries: 2,
    }
  );

  if (typeof response.data?.ok === "boolean") {
    return response.data;
  }

  return { ok: true, unavailable: [] };
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
    await inventoryApi.request(
      {
        method: "POST",
        url: "/api/inventory/stock/reserve",
        data: payload,
      },
      {
        maxRetries: 2,
      }
    );
    await clearInventoryReadCache();
    return { ok: true };
  } catch (reserveError) {
    try {
      await inventoryApi.request(
        {
          method: "POST",
          url: "/api/inventory/stock/deduct",
          data: payload,
        },
        {
          maxRetries: 1,
        }
      );
      await clearInventoryReadCache();
      return { ok: true };
    } catch (_deductError) {
      throw reserveError;
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

  await inventoryApi.request(
    {
      method: "POST",
      url: "/api/inventory/stock/release",
      data: payload,
    },
    {
      maxRetries: 2,
    }
  );

  await clearInventoryReadCache();
  return { ok: true };
}

module.exports = {
  fetchMedicines,
  getMedicineById,
  verifyStock,
  reserveStock,
  releaseStock,
  clearInventoryReadCache,
};

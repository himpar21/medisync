const axios = require("axios");

const INVENTORY_URL =
  process.env.INVENTORY_SERVICE_URL || "http://127.0.0.1:5002";

const FALLBACK_MEDICINES = [
  {
    _id: "MED-1001",
    name: "Paracetamol 650",
    category: "Pain Relief",
    price: 32,
    stock: 80,
    manufacturer: "MediSync Pharma",
  },
  {
    _id: "MED-1002",
    name: "Vitamin C 500mg",
    category: "Supplements",
    price: 140,
    stock: 45,
    manufacturer: "NutriCare Labs",
  },
  {
    _id: "MED-1003",
    name: "Cetirizine 10mg",
    category: "Allergy",
    price: 48,
    stock: 60,
    manufacturer: "HealWell",
  },
  {
    _id: "MED-1004",
    name: "Azithromycin 500",
    category: "Antibiotic",
    price: 190,
    stock: 25,
    manufacturer: "CareGen",
  },
  {
    _id: "MED-1005",
    name: "ORS Electrolyte Sachet",
    category: "Hydration",
    price: 18,
    stock: 120,
    manufacturer: "HydraPlus",
  },
  {
    _id: "MED-1006",
    name: "Omeprazole 20mg",
    category: "Digestive Care",
    price: 75,
    stock: 40,
    manufacturer: "CoreMeds",
  },
];

const fallbackStock = new Map(
  FALLBACK_MEDICINES.map((medicine) => [medicine._id, medicine.stock])
);

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

function filterFallbackMedicines({ q, category } = {}) {
  const search = (q || "").trim().toLowerCase();
  const categoryFilter = (category || "").trim().toLowerCase();

  return FALLBACK_MEDICINES.filter((medicine) => {
    const matchesSearch =
      !search ||
      medicine.name.toLowerCase().includes(search) ||
      medicine._id.toLowerCase().includes(search);
    const matchesCategory =
      !categoryFilter || medicine.category.toLowerCase() === categoryFilter;
    return matchesSearch && matchesCategory;
  }).map((medicine) => ({
    ...medicine,
    stock: fallbackStock.get(medicine._id) ?? medicine.stock,
  }));
}

async function fetchMedicines(filters = {}) {
  try {
    const response = await inventoryApi.get("/api/inventory/medicines", {
      params: filters,
    });
    const items = normalizeRemoteMedicines(response.data);

    if (items.length) {
      return items;
    }
  } catch (error) {
    // Fall back to a local development catalog when Module 2 is not running.
  }

  return filterFallbackMedicines(filters);
}

async function getMedicineById(medicineId) {
  try {
    const response = await inventoryApi.get(`/api/inventory/medicines/${medicineId}`);
    const remoteMedicine = response.data?.medicine || response.data;
    if (remoteMedicine) {
      return remoteMedicine;
    }
  } catch (error) {
    // Fall back below.
  }

  const fallback = FALLBACK_MEDICINES.find((medicine) => medicine._id === medicineId);
  if (!fallback) {
    return null;
  }

  return {
    ...fallback,
    stock: fallbackStock.get(fallback._id) ?? fallback.stock,
  };
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
    const unavailable = [];
    items.forEach((item) => {
      const available = fallbackStock.get(item.medicineId) || 0;
      if (item.quantity > available) {
        unavailable.push({
          medicineId: item.medicineId,
          requested: item.quantity,
          available,
        });
      }
    });

    return {
      ok: unavailable.length === 0,
      unavailable,
      fallback: true,
    };
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
  } catch (firstError) {
    try {
      await inventoryApi.post("/api/inventory/stock/deduct", payload);
      return { ok: true };
    } catch (secondError) {
      for (const item of items) {
        const currentStock = fallbackStock.get(item.medicineId) || 0;
        if (item.quantity > currentStock) {
          return {
            ok: false,
            message: `Insufficient stock for ${item.medicineName}`,
          };
        }
      }

      items.forEach((item) => {
        const currentStock = fallbackStock.get(item.medicineId) || 0;
        fallbackStock.set(item.medicineId, currentStock - item.quantity);
      });

      return { ok: true, fallback: true };
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
    items.forEach((item) => {
      const currentStock = fallbackStock.get(item.medicineId) || 0;
      fallbackStock.set(item.medicineId, currentStock + item.quantity);
    });
    return { ok: true, fallback: true };
  }
}

module.exports = {
  fetchMedicines,
  getMedicineById,
  verifyStock,
  reserveStock,
  releaseStock,
};

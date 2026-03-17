import api from "./api";
import { fetchMedicines as fetchOrderMedicines } from "./orderService";

export async function getMedicines(filters = {}) {
  try {
    const response = await api.get("/api/inventory/medicines", { params: filters });
    return response.data?.items || [];
  } catch (_error) {
    return fetchOrderMedicines(filters);
  }
}

export async function getMedicineById(medicineId) {
  try {
    const response = await api.get(`/api/inventory/medicines/${medicineId}`);
    return response.data?.medicine;
  } catch (_error) {
    const items = await getMedicines({ q: medicineId });
    return items.find((item) => String(item.id) === String(medicineId)) || null;
  }
}

export async function getInventoryCategories() {
  const response = await api.get("/api/inventory/categories");
  return response.data?.items || [];
}

export async function createMedicine(payload) {
  const response = await api.post("/api/inventory/medicines", payload);
  return response.data?.medicine;
}

export async function updateMedicine(medicineId, payload) {
  const response = await api.put(`/api/inventory/medicines/${medicineId}`, payload);
  return response.data?.medicine;
}

export async function deleteMedicine(medicineId) {
  const response = await api.delete(`/api/inventory/medicines/${medicineId}`);
  return response.data;
}

export async function adjustMedicineStock(medicineId, payload) {
  const response = await api.patch(`/api/inventory/medicines/${medicineId}/stock`, payload);
  return response.data?.medicine;
}

export async function getLowStockAlerts(params = {}) {
  const response = await api.get("/api/inventory/alerts/low-stock", { params });
  return response.data?.items || [];
}

export async function getExpiryAlerts(params = {}) {
  const response = await api.get("/api/inventory/alerts/expiry", { params });
  return response.data?.items || [];
}

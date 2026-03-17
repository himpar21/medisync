import api from "./api";

export async function fetchAdminSummary() {
  const response = await api.get("/api/analytics/summary");
  return response.data;
}

export async function fetchDailySales() {
  const response = await api.get("/api/analytics/sales/daily");
  return response.data?.items || [];
}

export async function fetchTopMedicines() {
  const response = await api.get("/api/analytics/medicines/top");
  return response.data?.items || [];
}

export async function fetchUserActivity() {
  const response = await api.get("/api/analytics/users/activity");
  return response.data?.items || [];
}

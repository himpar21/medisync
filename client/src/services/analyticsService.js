import api from "./api";

export async function fetchAdminSummary() {
  const response = await api.get("/api/analytics/summary");
  return response.data;
}

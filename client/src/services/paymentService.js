import api from "./api";

export async function fetchStripeConfig() {
  const response = await api.get("/api/payments/config");
  return response.data || {};
}

export async function createPaymentIntent(payload) {
  const response = await api.post("/api/payments/create", payload);
  return response.data || {};
}

export async function syncStripePayment(payload) {
  const response = await api.post("/api/payments/sync", payload);
  return response.data || {};
}

export async function fetchPaymentsByOrder(orderId) {
  const response = await api.get(`/api/payments/order/${orderId}`);
  return response.data?.items || [];
}

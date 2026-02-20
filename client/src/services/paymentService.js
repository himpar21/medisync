import api from "./api";

export async function createPaymentIntent(payload) {
  const response = await api.post("/api/payments/create", payload);
  return response.data;
}

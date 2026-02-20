import api from "./api";

export async function fetchMedicines(params = {}) {
  const response = await api.get("/api/orders/medicines", { params });
  return response.data?.items || [];
}

export async function fetchPickupSlots() {
  const response = await api.get("/api/orders/pickup-slots");
  return response.data?.items || [];
}

export async function fetchCart() {
  const response = await api.get("/api/orders/cart");
  return response.data?.cart;
}

export async function addCartItem(payload) {
  const response = await api.post("/api/orders/cart/items", payload);
  return response.data?.cart;
}

export async function updateCartItem(medicineId, payload) {
  const response = await api.patch(`/api/orders/cart/items/${medicineId}`, payload);
  return response.data?.cart;
}

export async function removeCartItem(medicineId) {
  const response = await api.delete(`/api/orders/cart/items/${medicineId}`);
  return response.data?.cart;
}

export async function clearCartItems() {
  const response = await api.delete("/api/orders/cart");
  return response.data?.cart;
}

export async function checkoutCart(payload) {
  const idempotencyKey = `checkout-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2, 8)}`;

  const response = await api.post("/api/orders/checkout", payload, {
    headers: {
      "Idempotency-Key": idempotencyKey,
    },
  });
  return response.data?.order;
}

export async function fetchOrders() {
  const response = await api.get("/api/orders");
  return response.data?.items || [];
}

export async function fetchOrderById(orderId) {
  const response = await api.get(`/api/orders/${orderId}`);
  return response.data?.order;
}

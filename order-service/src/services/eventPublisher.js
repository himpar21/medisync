const axios = require("axios");

const PAYMENT_EVENT_URL = process.env.PAYMENT_EVENT_URL || "";
const ANALYTICS_EVENT_URL = process.env.ANALYTICS_EVENT_URL || "";

async function dispatch(url, eventType, payload) {
  if (!url) {
    return;
  }

  try {
    await axios.post(
      url,
      {
        eventType,
        payload,
        emittedAt: new Date().toISOString(),
      },
      { timeout: 4000 }
    );
  } catch (error) {
    console.warn(`Event dispatch failed for ${eventType} to ${url}:`, error.message);
  }
}

async function publish(eventType, payload) {
  console.log(`[OrderEvent] ${eventType}`, {
    orderNumber: payload.orderNumber,
    userId: payload.userId,
  });

  await Promise.all([
    dispatch(PAYMENT_EVENT_URL, eventType, payload),
    dispatch(ANALYTICS_EVENT_URL, eventType, payload),
  ]);
}

async function publishOrderCreated(order) {
  await publish("order.created", {
    orderId: order._id,
    orderNumber: order.orderNumber,
    userId: order.userId,
    totalAmount: order.totalAmount,
    status: order.status,
    address: order.address,
    items: order.items.map((item) => ({
      medicineId: item.medicineId,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
    })),
    pickupSlot: order.pickupSlot,
    placedAt: order.placedAt,
  });
}

async function publishOrderStatusUpdated(order, previousStatus) {
  await publish("order.status_updated", {
    orderId: order._id,
    orderNumber: order.orderNumber,
    userId: order.userId,
    previousStatus,
    currentStatus: order.status,
    paymentStatus: order.paymentStatus,
    updatedAt: new Date().toISOString(),
  });
}

module.exports = {
  publishOrderCreated,
  publishOrderStatusUpdated,
};

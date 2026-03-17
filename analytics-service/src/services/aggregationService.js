const axios = require("axios");
const Report = require("../models/Report");

const INVENTORY_SERVICE_URL =
  process.env.INVENTORY_SERVICE_URL || "http://127.0.0.1:5002";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function handleOrderCreated(payload, eventType, emittedAt) {
  const orderId = String(payload.orderId || "").trim();
  if (!orderId) {
    return;
  }

  const items = Array.isArray(payload.items)
    ? payload.items.map((item) => ({
        medicineId: String(item.medicineId || "").trim(),
        medicineName: String(item.medicineName || "").trim(),
        quantity: Math.max(1, Math.floor(toNumber(item.quantity, 1))),
        lineTotal: toNumber(item.lineTotal, 0),
      }))
    : [];

  const updateDoc = {
    orderNumber: payload.orderNumber || "",
    userId: String(payload.userId || "unknown"),
    totalAmount: toNumber(payload.totalAmount, 0),
    status: payload.status || "placed",
    paymentStatus: "pending",
    items,
    placedAt: payload.placedAt ? new Date(payload.placedAt) : new Date(),
    lastEventAt: emittedAt,
    $push: {
      rawEvents: {
        eventType,
        payload,
        emittedAt,
      },
    },
  };

  await Report.findOneAndUpdate({ orderId }, updateDoc, {
    upsert: true,
    new: true,
    runValidators: true,
  });
}

async function handleOrderStatusUpdated(payload, eventType, emittedAt) {
  const orderId = String(payload.orderId || "").trim();
  if (!orderId) {
    return;
  }

  const updateDoc = {
    status: payload.currentStatus || "placed",
    lastEventAt: emittedAt,
    $push: {
      rawEvents: {
        eventType,
        payload,
        emittedAt,
      },
    },
  };

  if (payload.paymentStatus) {
    updateDoc.paymentStatus = payload.paymentStatus;
  }

  await Report.findOneAndUpdate({ orderId }, updateDoc, {
    upsert: false,
    new: true,
  });
}

async function handlePaymentSucceeded(payload, eventType, emittedAt) {
  const orderId = String(payload.orderId || "").trim();
  if (!orderId) {
    return;
  }

  const updateDoc = {
    paymentStatus: "paid",
    status: "confirmed",
    paidAt: payload.paidAt ? new Date(payload.paidAt) : new Date(),
    lastEventAt: emittedAt,
    $push: {
      rawEvents: {
        eventType,
        payload,
        emittedAt,
      },
    },
  };

  if (payload.amount) {
    updateDoc.totalAmount = toNumber(payload.amount, 0);
  }

  await Report.findOneAndUpdate({ orderId }, updateDoc, {
    upsert: false,
    new: true,
  });
}

async function handlePaymentFailed(payload, eventType, emittedAt) {
  const orderId = String(payload.orderId || "").trim();
  if (!orderId) {
    return;
  }

  await Report.findOneAndUpdate(
    { orderId },
    {
      paymentStatus: "failed",
      lastEventAt: emittedAt,
      $push: {
        rawEvents: {
          eventType,
          payload,
          emittedAt,
        },
      },
    },
    {
      upsert: false,
      new: true,
    }
  );
}

async function ingestEvent({ eventType, payload, emittedAt }) {
  const safeEventType = String(eventType || "").trim();
  const safePayload = payload || {};
  const occurredAt = emittedAt ? new Date(emittedAt) : new Date();

  if (!safeEventType) {
    throw new Error("eventType is required");
  }

  if (safeEventType === "order.created") {
    await handleOrderCreated(safePayload, safeEventType, occurredAt);
    return;
  }

  if (safeEventType === "order.status_updated") {
    await handleOrderStatusUpdated(safePayload, safeEventType, occurredAt);
    return;
  }

  if (safeEventType === "payment.succeeded") {
    await handlePaymentSucceeded(safePayload, safeEventType, occurredAt);
    return;
  }

  if (safeEventType === "payment.failed") {
    await handlePaymentFailed(safePayload, safeEventType, occurredAt);
    return;
  }

  if (safePayload.orderId) {
    await Report.findOneAndUpdate(
      { orderId: String(safePayload.orderId) },
      {
        $set: { lastEventAt: occurredAt },
        $push: {
          rawEvents: {
            eventType: safeEventType,
            payload: safePayload,
            emittedAt: occurredAt,
          },
        },
      },
      { upsert: true }
    );
  }
}

async function fetchTotalMedicines() {
  try {
    const response = await axios.get(`${INVENTORY_SERVICE_URL}/api/inventory/medicines`, {
      timeout: 5000,
    });
    const items = Array.isArray(response.data?.items) ? response.data.items : [];
    return items.length;
  } catch (error) {
    const result = await Report.aggregate([
      { $unwind: "$items" },
      { $group: { _id: "$items.medicineId" } },
      { $count: "total" },
    ]);
    return result[0]?.total || 0;
  }
}

async function getSummary() {
  const [
    totalOrders,
    revenueResult,
    pendingPayments,
    totalUsersResult,
    topMedicines,
    dailySales,
    userActivity,
    totalMedicines,
  ] = await Promise.all([
    Report.countDocuments(),
    Report.aggregate([
      { $match: { paymentStatus: "paid" } },
      { $group: { _id: null, revenue: { $sum: "$totalAmount" } } },
    ]),
    Report.countDocuments({ paymentStatus: "pending" }),
    Report.aggregate([{ $group: { _id: "$userId" } }, { $count: "total" }]),
    Report.aggregate([
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.medicineId",
          medicineName: { $first: "$items.medicineName" },
          totalQuantity: { $sum: "$items.quantity" },
          totalRevenue: { $sum: "$items.lineTotal" },
        },
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 5 },
    ]),
    Report.aggregate([
      { $match: { paymentStatus: "paid" } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: { $ifNull: ["$paidAt", "$placedAt"] },
            },
          },
          orders: { $sum: 1 },
          revenue: { $sum: "$totalAmount" },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 14 },
    ]),
    Report.aggregate([
      {
        $group: {
          _id: "$userId",
          totalOrders: { $sum: 1 },
          totalSpend: {
            $sum: {
              $cond: [{ $eq: ["$paymentStatus", "paid"] }, "$totalAmount", 0],
            },
          },
          lastOrderAt: { $max: "$placedAt" },
        },
      },
      { $sort: { totalOrders: -1 } },
      { $limit: 10 },
    ]),
    fetchTotalMedicines(),
  ]);

  return {
    totals: {
      orders: totalOrders,
      medicines: totalMedicines,
      users: totalUsersResult[0]?.total || 0,
      pendingPayments,
      revenue: Number((revenueResult[0]?.revenue || 0).toFixed(2)),
    },
    dailySales: dailySales.map((entry) => ({
      date: entry._id,
      orders: entry.orders,
      revenue: Number(entry.revenue.toFixed(2)),
    })),
    topMedicines: topMedicines.map((entry) => ({
      medicineId: entry._id,
      medicineName: entry.medicineName || entry._id,
      totalQuantity: entry.totalQuantity,
      totalRevenue: Number(entry.totalRevenue.toFixed(2)),
    })),
    userActivity: userActivity.map((entry) => ({
      userId: entry._id,
      totalOrders: entry.totalOrders,
      totalSpend: Number(entry.totalSpend.toFixed(2)),
      lastOrderAt: entry.lastOrderAt,
    })),
  };
}

module.exports = {
  ingestEvent,
  getSummary,
};

const Cart = require("../models/Cart");
const Order = require("../models/Order");
const inventoryClient = require("../services/inventoryClient");
const eventPublisher = require("../services/eventPublisher");

const CHECKOUT_LOCK_MS = 2 * 60 * 1000;
const MAX_ITEM_QUANTITY = 20;
const ORDER_STATUS = [
  "placed",
  "payment_pending",
  "confirmed",
  "ready_for_pickup",
  "picked_up",
  "cancelled",
];

function toNumber(value, defaultValue = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function formatCart(cart) {
  return {
    userId: cart.userId,
    items: cart.items.map((item) => ({
      medicineId: item.medicineId,
      medicineName: item.medicineName,
      category: item.category,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
    })),
    totalItems: cart.totalItems,
    subtotal: cart.subtotal,
    currency: cart.currency,
    updatedAt: cart.updatedAt,
  };
}

function formatOrder(order) {
  return {
    id: order._id,
    orderNumber: order.orderNumber,
    userId: order.userId,
    items: order.items,
    totalItems: order.totalItems,
    subtotal: order.subtotal,
    tax: order.tax,
    deliveryFee: order.deliveryFee,
    totalAmount: order.totalAmount,
    currency: order.currency,
    pickupSlot: order.pickupSlot,
    address: order.address,
    status: order.status,
    paymentStatus: order.paymentStatus,
    inventoryStatus: order.inventoryStatus,
    statusHistory: order.statusHistory,
    note: order.note,
    placedAt: order.placedAt,
    updatedAt: order.updatedAt,
  };
}

function generateOrderNumber() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `MS-${yyyy}${mm}${dd}-${rand}`;
}

function generatePickupSlots(days = 3) {
  const slots = [];
  const windows = [
    { startHour: 9, endHour: 11 },
    { startHour: 11, endHour: 13 },
    { startHour: 14, endHour: 16 },
    { startHour: 16, endHour: 18 },
    { startHour: 18, endHour: 20 },
  ];

  for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
    const baseDate = new Date();
    baseDate.setHours(0, 0, 0, 0);
    baseDate.setDate(baseDate.getDate() + dayOffset);

    windows.forEach((windowSlot, index) => {
      const slotDate = new Date(baseDate);
      const slotLabel = `${String(windowSlot.startHour).padStart(2, "0")}:00 - ${String(
        windowSlot.endHour
      ).padStart(2, "0")}:00`;
      slots.push({
        id: `${slotDate.toISOString().slice(0, 10)}-S${index + 1}`,
        date: slotDate.toISOString(),
        label: slotLabel,
      });
    });
  }

  return slots;
}

async function getOrCreateCart(userId) {
  let cart = await Cart.findOne({ userId });
  if (!cart) {
    cart = await Cart.create({ userId, items: [] });
  }
  return cart;
}

async function mutateCart(userId, mutator) {
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const cart = await getOrCreateCart(userId);
    mutator(cart);
    cart.recalculate();

    try {
      await cart.save();
      return cart;
    } catch (error) {
      if (error.name === "VersionError" && attempt < maxRetries) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Unable to update cart due to concurrent updates");
}

exports.listMedicines = async (req, res) => {
  const medicines = await inventoryClient.fetchMedicines({
    q: req.query.q,
    category: req.query.category,
  });

  res.status(200).json({
    items: medicines.map((medicine) => ({
      id: medicine._id || medicine.id || medicine.medicineId,
      name: medicine.name,
      category: medicine.category || "General",
      price: toNumber(medicine.price),
      stock: toNumber(medicine.stock),
      manufacturer: medicine.manufacturer || "Unknown",
    })),
  });
};

exports.getPickupSlots = async (req, res) => {
  const slots = generatePickupSlots(4);
  res.status(200).json({ items: slots });
};

exports.getCart = async (req, res) => {
  const cart = await getOrCreateCart(req.user.userId);
  cart.recalculate();
  await cart.save();
  res.status(200).json({ cart: formatCart(cart) });
};

exports.addToCart = async (req, res) => {
  const medicineId = String(req.body.medicineId || "").trim();
  const requestedQty = Math.max(1, Math.floor(toNumber(req.body.quantity, 1)));

  if (!medicineId) {
    return res.status(400).json({ message: "medicineId is required" });
  }

  if (requestedQty > MAX_ITEM_QUANTITY) {
    return res.status(400).json({
      message: `Quantity cannot exceed ${MAX_ITEM_QUANTITY} per item`,
    });
  }

  const medicine = await inventoryClient.getMedicineById(medicineId);
  if (!medicine) {
    return res.status(404).json({ message: "Medicine not found" });
  }

  if (requestedQty > toNumber(medicine.stock, 0)) {
    return res.status(409).json({ message: "Requested quantity exceeds stock" });
  }

  const cart = await mutateCart(req.user.userId, (editableCart) => {
    const current = editableCart.items.find((item) => item.medicineId === medicineId);
    if (current) {
      current.quantity = Math.min(current.quantity + requestedQty, MAX_ITEM_QUANTITY);
    } else {
      editableCart.items.push({
        medicineId,
        medicineName: medicine.name,
        category: medicine.category || "General",
        unitPrice: toNumber(medicine.price, 0),
        quantity: requestedQty,
      });
    }
  });

  return res.status(200).json({ cart: formatCart(cart) });
};

exports.updateCartItem = async (req, res) => {
  const medicineId = String(req.params.medicineId || "").trim();
  const nextQuantity = Math.floor(toNumber(req.body.quantity, 0));

  if (!medicineId) {
    return res.status(400).json({ message: "medicineId is required" });
  }

  if (nextQuantity > MAX_ITEM_QUANTITY) {
    return res.status(400).json({
      message: `Quantity cannot exceed ${MAX_ITEM_QUANTITY} per item`,
    });
  }

  const cart = await mutateCart(req.user.userId, (editableCart) => {
    const index = editableCart.items.findIndex((item) => item.medicineId === medicineId);
    if (index === -1) {
      throw new Error("ITEM_NOT_FOUND");
    }

    if (nextQuantity <= 0) {
      editableCart.items.splice(index, 1);
    } else {
      editableCart.items[index].quantity = nextQuantity;
    }
  }).catch((error) => {
    if (error.message === "ITEM_NOT_FOUND") {
      return null;
    }
    throw error;
  });

  if (!cart) {
    return res.status(404).json({ message: "Cart item not found" });
  }

  return res.status(200).json({ cart: formatCart(cart) });
};

exports.removeFromCart = async (req, res) => {
  const medicineId = String(req.params.medicineId || "").trim();

  const cart = await mutateCart(req.user.userId, (editableCart) => {
    editableCart.items = editableCart.items.filter((item) => item.medicineId !== medicineId);
  });

  return res.status(200).json({ cart: formatCart(cart) });
};

exports.clearCart = async (req, res) => {
  const cart = await mutateCart(req.user.userId, (editableCart) => {
    editableCart.items = [];
  });
  return res.status(200).json({ cart: formatCart(cart) });
};

exports.checkout = async (req, res) => {
  const userId = req.user.userId;
  const requestedSlot = req.body.pickupSlot;
  const selectedAddress = String(req.body.address || "").trim();
  const note = String(req.body.note || "").trim();
  const idempotencyKey = String(
    req.headers["idempotency-key"] || req.body.idempotencyKey || ""
  ).trim();

  if (!selectedAddress) {
    return res.status(400).json({
      message: "address is required",
    });
  }

  if (!requestedSlot || !requestedSlot.date || !requestedSlot.label) {
    return res.status(400).json({
      message: "pickupSlot.date and pickupSlot.label are required",
    });
  }

  if (idempotencyKey) {
    const existingOrder = await Order.findOne({ userId, idempotencyKey }).sort({
      createdAt: -1,
    });
    if (existingOrder) {
      return res.status(200).json({
        message: "Order already created for this idempotency key",
        order: formatOrder(existingOrder),
      });
    }
  }

  const now = new Date();
  const lockUntil = new Date(now.getTime() + CHECKOUT_LOCK_MS);

  const cart = await Cart.findOneAndUpdate(
    {
      userId,
      $or: [{ isLocked: false }, { lockExpiresAt: { $lte: now } }],
    },
    {
      $set: {
        isLocked: true,
        lockExpiresAt: lockUntil,
      },
    },
    { new: true }
  );

  if (!cart) {
    return res.status(409).json({
      message: "Checkout already in progress. Please retry in a moment.",
    });
  }

  let stockReserved = false;

  try {
    cart.recalculate();
    await cart.save();

    if (!cart.items.length) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    const stockCheck = await inventoryClient.verifyStock(cart.items);
    if (!stockCheck.ok) {
      return res.status(409).json({
        message: "Some medicines are out of stock",
        unavailable: stockCheck.unavailable || [],
      });
    }

    const orderNumber = generateOrderNumber();

    const reserveResult = await inventoryClient.reserveStock(cart.items, orderNumber);
    if (!reserveResult.ok) {
      return res.status(409).json({
        message: reserveResult.message || "Unable to reserve stock",
      });
    }
    stockReserved = true;

    const tax = Number((cart.subtotal * 0.05).toFixed(2));
    const deliveryFee = 0;
    const totalAmount = Number((cart.subtotal + tax + deliveryFee).toFixed(2));

    const order = await Order.create({
      orderNumber,
      userId,
      items: cart.items.map((item) => ({
        medicineId: item.medicineId,
        medicineName: item.medicineName,
        category: item.category,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
      })),
      totalItems: cart.totalItems,
      subtotal: cart.subtotal,
      tax,
      deliveryFee,
      totalAmount,
      currency: cart.currency,
      pickupSlot: {
        date: new Date(requestedSlot.date),
        label: requestedSlot.label,
      },
      address: selectedAddress,
      status: "placed",
      paymentStatus: "pending",
      inventoryStatus: "reserved",
      idempotencyKey: idempotencyKey || undefined,
      note,
      statusHistory: [
        {
          status: "placed",
          updatedBy: userId,
          note: "Order placed successfully",
        },
      ],
      placedAt: new Date(),
    });

    cart.items = [];
    cart.recalculate();
    cart.isLocked = false;
    cart.lockExpiresAt = new Date(0);
    await cart.save();

    await eventPublisher.publishOrderCreated(order);

    return res.status(201).json({
      message: "Order placed successfully",
      order: formatOrder(order),
    });
  } catch (error) {
    if (stockReserved) {
      await inventoryClient.releaseStock(cart.items, `rollback-${Date.now()}`);
    }
    throw error;
  } finally {
    await Cart.updateOne(
      { userId },
      { $set: { isLocked: false, lockExpiresAt: new Date(0) } }
    );
  }
};

exports.getOrderHistory = async (req, res) => {
  const isPrivileged = ["admin", "pharmacist"].includes(req.user.role);
  const filter = isPrivileged ? {} : { userId: req.user.userId };

  const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(100);

  res.status(200).json({
    items: orders.map(formatOrder),
  });
};

exports.getOrderById = async (req, res) => {
  const isPrivileged = ["admin", "pharmacist"].includes(req.user.role);
  const filter = isPrivileged
    ? { _id: req.params.orderId }
    : { _id: req.params.orderId, userId: req.user.userId };

  const order = await Order.findOne(filter);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  return res.status(200).json({ order: formatOrder(order) });
};

exports.updateOrderStatus = async (req, res) => {
  const nextStatus = String(req.body.status || "").trim();
  const note = String(req.body.note || "").trim();

  if (!ORDER_STATUS.includes(nextStatus)) {
    return res.status(400).json({
      message: `Invalid status. Allowed: ${ORDER_STATUS.join(", ")}`,
    });
  }

  const order = await Order.findById(req.params.orderId);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const previousStatus = order.status;
  if (previousStatus === nextStatus) {
    return res.status(200).json({ order: formatOrder(order) });
  }

  order.status = nextStatus;
  if (nextStatus === "cancelled" && order.inventoryStatus === "reserved") {
    await inventoryClient.releaseStock(order.items, `cancel-${order.orderNumber}`);
    order.inventoryStatus = "released";
  }

  order.statusHistory.push({
    status: nextStatus,
    updatedBy: req.user.userId,
    note,
  });

  await order.save();
  await eventPublisher.publishOrderStatusUpdated(order, previousStatus);

  return res.status(200).json({
    message: "Order status updated",
    order: formatOrder(order),
  });
};

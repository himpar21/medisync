const express = require("express");
const controller = require("../controllers/orderController");
const { authenticate, authorize } = require("../middlewares/authMiddleware");

const router = express.Router();
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

router.use(authenticate);

router.get("/medicines", asyncHandler(controller.listMedicines));
router.get("/pickup-slots", asyncHandler(controller.getPickupSlots));

router.get("/cart", asyncHandler(controller.getCart));
router.post("/cart/items", asyncHandler(controller.addToCart));
router.patch("/cart/items/:medicineId", asyncHandler(controller.updateCartItem));
router.delete("/cart/items/:medicineId", asyncHandler(controller.removeFromCart));
router.delete("/cart", asyncHandler(controller.clearCart));

router.post("/checkout", asyncHandler(controller.checkout));

router.get("/", asyncHandler(controller.getOrderHistory));
router.get("/:orderId", asyncHandler(controller.getOrderById));
router.patch(
  "/:orderId/status",
  authorize("admin", "pharmacist"),
  asyncHandler(controller.updateOrderStatus)
);

module.exports = router;

const express = require("express");
const controller = require("../controllers/paymentController");
const { authenticate, authorize } = require("../middlewares/authMiddleware");

const router = express.Router();

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

router.post("/events", asyncHandler(controller.handleOrderEvents));

router.use(authenticate);

router.get("/config", asyncHandler(controller.getStripeConfig));
router.post("/create", asyncHandler(controller.createPayment));
router.post("/sync", asyncHandler(controller.syncStripePayment));
router.get("/order/:orderId", asyncHandler(controller.getPaymentByOrderId));
router.get("/:paymentId", asyncHandler(controller.getPaymentById));
router.get("/", authorize("admin", "pharmacist"), asyncHandler(controller.listPayments));

module.exports = router;

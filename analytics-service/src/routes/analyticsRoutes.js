const express = require("express");
const controller = require("../controllers/analyticsController");
const { authenticate, authorize } = require("../middlewares/authMiddleware");

const router = express.Router();

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

router.post("/events", asyncHandler(controller.ingestEvent));

router.use(authenticate);
router.use(authorize("admin", "pharmacist"));

router.get("/summary", asyncHandler(controller.getSummary));
router.get("/sales/daily", asyncHandler(controller.getDailySales));
router.get("/medicines/top", asyncHandler(controller.getTopMedicines));
router.get("/users/activity", asyncHandler(controller.getUserActivity));

module.exports = router;

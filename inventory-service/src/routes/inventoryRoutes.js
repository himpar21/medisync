const express = require("express");
const controller = require("../controllers/inventoryController");
const { authenticate, authorize, optionalAuthenticate } = require("../middlewares/authMiddleware");

const router = express.Router();

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

router.get("/medicines", optionalAuthenticate, asyncHandler(controller.listMedicines));
router.get("/medicines/:medicineId", optionalAuthenticate, asyncHandler(controller.getMedicineById));
router.get("/categories", asyncHandler(controller.listCategories));

router.post("/stock/verify", asyncHandler(controller.verifyStock));
router.post("/stock/reserve", asyncHandler(controller.reserveStock));
router.post("/stock/release", asyncHandler(controller.releaseStock));
router.post("/stock/deduct", asyncHandler(controller.deductStock));

router.get(
  "/alerts/low-stock",
  authenticate,
  authorize("admin", "pharmacist"),
  asyncHandler(controller.lowStockAlerts)
);
router.get(
  "/alerts/expiry",
  authenticate,
  authorize("admin", "pharmacist"),
  asyncHandler(controller.expiryAlerts)
);

router.post(
  "/medicines",
  authenticate,
  authorize("admin", "pharmacist"),
  asyncHandler(controller.createMedicine)
);
router.put(
  "/medicines/:medicineId",
  authenticate,
  authorize("admin", "pharmacist"),
  asyncHandler(controller.updateMedicine)
);
router.patch(
  "/medicines/:medicineId/stock",
  authenticate,
  authorize("admin", "pharmacist"),
  asyncHandler(controller.adjustStock)
);
router.delete(
  "/medicines/:medicineId",
  authenticate,
  authorize("admin", "pharmacist"),
  asyncHandler(controller.deleteMedicine)
);

module.exports = router;

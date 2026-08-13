import { Router } from "express";
import { getHealth, getMetricsJson } from "../controllers/health.controller.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

const router = Router();

router.get("/", asyncHandler(getHealth));
router.get("/metrics", getMetricsJson);

export default router;

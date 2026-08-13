import { Router } from "express";
import { list } from "../controllers/guides.controller.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

const router = Router();

router.get("/", asyncHandler(list));

export default router;

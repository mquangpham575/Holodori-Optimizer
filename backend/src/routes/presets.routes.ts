import { Router } from "express";
import { get, put } from "../controllers/presets.controller.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import { presetsBodySchema } from "../schemas/index.js";

const router = Router();

router.get("/", asyncHandler(get));
router.put("/", validate(presetsBodySchema), asyncHandler(put));

export default router;

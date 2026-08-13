import { Router } from "express";
import { get, put } from "../controllers/roster.controller.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import { rosterBodySchema } from "../schemas/index.js";

const router = Router();

router.get("/", asyncHandler(get));
router.put("/", validate(rosterBodySchema), asyncHandler(put));

export default router;

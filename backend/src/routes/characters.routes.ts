import { Router } from "express";
import { list, search } from "../controllers/characters.controller.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

const router = Router();

router.get("/", asyncHandler(list));
router.get("/search", asyncHandler(search));

export default router;

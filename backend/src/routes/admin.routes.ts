import { Router } from "express";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { validate } from "../middleware/validate.js";
import { login } from "../controllers/admin.auth.controller.js";
import {
  upload,
  cardArtUpload,
  syncFromFileAdmin,
  charactersBulk,
  charactersCreate,
  charactersUpdate,
  charactersDelete,
  guidesCreate,
  guidesUpdate,
  guidesDelete,
} from "../controllers/admin.controller.js";
import {
  loginSchema,
  charactersBulkSchema,
  characterCreateSchema,
  guideCreateSchema,
  characterUpdateSchema,
  guideUpdateSchema,
  uploadSchema,
  cardArtSchema,
} from "../schemas/index.js";

const router = Router();

// Public, rate-limited login issues a signed admin token.
router.post(
  "/login",
  rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }),
  validate(loginSchema),
  login
);

// Everything below requires a valid admin token.
router.use(requireAdmin);

router.post("/upload", validate(uploadSchema), upload);
router.post("/card-art", validate(cardArtSchema), asyncHandler(cardArtUpload));
router.post("/sync-from-file", asyncHandler(syncFromFileAdmin));

// Characters CRUD
router.post("/characters/bulk", validate(charactersBulkSchema), asyncHandler(charactersBulk));
router.post("/characters", validate(characterCreateSchema), asyncHandler(charactersCreate));
router.put("/characters/:id", validate(characterUpdateSchema), asyncHandler(charactersUpdate));
router.delete("/characters/:id", asyncHandler(charactersDelete));

// Guides CRUD
router.post("/guides", validate(guideCreateSchema), asyncHandler(guidesCreate));
router.put("/guides/:id", validate(guideUpdateSchema), asyncHandler(guidesUpdate));
router.delete("/guides/:id", asyncHandler(guidesDelete));

export default router;

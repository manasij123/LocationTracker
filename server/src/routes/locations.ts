import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { searchLimiter } from "../middleware/rateLimiter";
import * as locationsController from "../controllers/locationsController";

const router = Router();

router.post("/search", searchLimiter, asyncHandler(locationsController.search));

export default router;

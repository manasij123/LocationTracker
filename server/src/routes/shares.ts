import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { createShareLimiter, openLimiter } from "../middleware/rateLimiter";
import * as sharesController from "../controllers/sharesController";

const router = Router();

router.post("/", createShareLimiter, asyncHandler(sharesController.createShare));
router.get("/", asyncHandler(sharesController.listShares));
router.get("/:shareId", asyncHandler(sharesController.getPublicShare));
router.post("/:shareId/revoke", asyncHandler(sharesController.revokeShare));
router.get("/:shareId/analytics", asyncHandler(sharesController.getAnalytics));
router.post("/:shareId/open", openLimiter, asyncHandler(sharesController.recordOpen));

export default router;

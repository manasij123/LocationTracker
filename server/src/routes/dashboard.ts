import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import * as dashboardController from "../controllers/dashboardController";

const router = Router();

router.get("/stats", asyncHandler(dashboardController.getStats));

export default router;

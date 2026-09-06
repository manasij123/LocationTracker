import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import * as activityController from "../controllers/activityController";

const router = Router();

router.get("/", asyncHandler(activityController.getActivity));

export default router;

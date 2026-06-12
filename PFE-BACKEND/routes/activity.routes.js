import express from "express";
import activityController from "../controllers/activity.controller.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";

const router = express.Router();

// GET /api/activities/mine
router.get("/mine", authenticateToken, activityController.getMyActivities);

export default router;

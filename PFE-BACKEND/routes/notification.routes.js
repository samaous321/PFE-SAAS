import express from "express";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import * as notificationCtrl from "../controllers/notification.controller.js";

const router = express.Router();

router.get("/stream", notificationCtrl.streamMyNotifications);

router.use(authenticateToken);

router.get("/", notificationCtrl.getMyNotifications);
router.patch("/read-all", notificationCtrl.markMyNotificationsRead);
router.patch("/:notificationId/read", notificationCtrl.markMyNotificationRead);

export default router;

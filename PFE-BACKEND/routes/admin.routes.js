import express from "express";
import { getActivityLogs, getDashboard, getHealth, getAdminAlerts, getAdminStats, manageQuarantinedFile, getAIStatisticsController, getAILogsController } from "../controllers/admin.controller.js";
import { getAICircuitController, postAICircuitResetController } from "../controllers/admin.controller.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { authorizeAnyAdmin } from "../middlewares/authorize.middleware.js";

const router = express.Router();

// SECURITY: All admin endpoints require authentication and admin role (SUPERADMIN or TENANT_ADMIN)
router.use(authenticateToken);
router.use(authorizeAnyAdmin);

router.get("/stats", getAdminStats);
router.get("/ai/statistics", getAIStatisticsController);
router.get("/dashboard", getDashboard);
router.get("/health", getHealth);
router.get("/logs", getActivityLogs);
router.get("/ai/logs", getAILogsController);
router.get('/ai/circuit', getAICircuitController);
router.post('/ai/circuit/reset', postAICircuitResetController);
router.get("/alerts", getAdminAlerts);
router.patch("/alerts/:fileId", manageQuarantinedFile);

export default router;

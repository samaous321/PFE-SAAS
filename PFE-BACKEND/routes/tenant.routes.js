import express from "express";
import * as tenantController from "../controllers/tenant.controller.js";
import { authenticateToken, requireRole } from "../middlewares/auth.middleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

// Public route - check if tenant domain exists (no auth required)
router.get("/check-domain", tenantController.checkDomainExists);

// Protected routes - require authentication and SUPERADMIN role
router.use(authenticateToken);
router.use(requireRole(ROLES.SUPERADMIN));

router.post("/", tenantController.create);
router.get("/", tenantController.getAll);
router.get("/:id/stats", tenantController.getStats);
router.get("/:id/quota", tenantController.getQuota);
router.get("/:id/details", tenantController.getDetails);
router.patch("/:id/quota", tenantController.updateQuota);
router.get("/:id", tenantController.getOne);
router.put("/:id", tenantController.update);
router.delete("/:id", tenantController.remove);

export default router;
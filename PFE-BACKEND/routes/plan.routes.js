import express from "express";
import * as planController from "../controllers/plan.controller.js";
import { authenticateToken, requireRole } from "../middlewares/auth.middleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

// Route publique pour obtenir les plans actifs (sans authentification)
router.get("/active", planController.getActivePlans);

// Routes protégées (nécessitent l'authentification et le rôle SUPERADMIN)
router.use(authenticateToken);
router.use(requireRole(ROLES.SUPERADMIN));

router.get("/", planController.getAll);
router.post("/", planController.create);
router.get("/:slug", planController.getOne);
router.put("/:slug", planController.update);
router.delete("/:slug", planController.remove);

export default router;

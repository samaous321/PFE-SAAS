import express from "express";
import * as complaintCtrl from "../controllers/complaint.controller.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/auth.middleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

router.use(authenticateToken);
// Allow both SUPERADMIN and TENANT_ADMIN to manage complaints
router.use(requireRole(ROLES.SUPERADMIN, ROLES.TENANT_ADMIN));

router.get("/", complaintCtrl.getAdminComplaints);
router.get("/stats", complaintCtrl.getComplaintStats);
router.get("/export", complaintCtrl.exportComplaintsCsv);
router.get("/:ticketId", complaintCtrl.getAdminComplaintDetails);
router.post("/:ticketId/messages", complaintCtrl.addAdminComplaintMessage);
router.put("/:ticketId/assign", complaintCtrl.assignComplaint);
router.put("/:ticketId/status", complaintCtrl.updateComplaintStatus);

export default router;

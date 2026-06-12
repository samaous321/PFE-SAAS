import express from "express";
import * as complaintCtrl from "../controllers/complaint.controller.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.use(authenticateToken);

router.post("/", complaintCtrl.createComplaint);
router.get("/my", complaintCtrl.getMyComplaints);
router.get("/:ticketId", complaintCtrl.getComplaintDetails);
router.post("/:ticketId/messages", complaintCtrl.addMyComplaintMessage);
router.put("/:ticketId/cancel", complaintCtrl.cancelMyComplaint);

export default router;

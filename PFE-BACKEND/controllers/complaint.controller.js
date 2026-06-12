import * as complaintService from "../services/complaint.service.js";
import activityService from "../services/activity.service.js";

const getActorFromRequest = (req) => {
  const userId = req.user?.userId || req.user?._id || req.user?.id;

  if (!userId) {
    throw new Error("Unauthorized");
  }

  return {
    userId: userId.toString(),
    tenantId: req.user?.tenantId ? req.user.tenantId.toString() : null,
    role: req.user?.role || "user",
    email: req.user?.email || req.body?.requesterEmail || "unknown@example.com",
    fullName:
      req.user?.fullName ||
      [req.user?.firstName, req.user?.lastName].filter(Boolean).join(" ") ||
      req.body?.requesterName ||
      "Unknown User",
  };
};

const mapStatusCode = (error) => {
  const message = String(error?.message || "");

  if (["Unauthorized", "Admin access required"].includes(message)) return 401;
  if (["Forbidden"].includes(message)) return 403;
  if (["Complaint not found"].includes(message)) return 404;
  if (
    message.includes("Invalid") ||
    message.includes("required") ||
    message.includes("Cannot") ||
    message.includes("cannot")
  ) {
    return 400;
  }

  return 500;
};

export const createComplaint = async (req, res) => {
  try {
    const actor = getActorFromRequest(req);
    const data = await complaintService.createComplaint(req.body, actor);

    // Activity log: complaint created
    try {
      await activityService.logActivity({
        userId: actor.userId,
        tenantId: actor.tenantId,
        type: 'complaint',
        action: 'create_complaint',
        resourceId: data._id,
        resourceType: 'complaint',
        metadata: { subject: data.subject || null },
        ip: req.ip,
        userAgent: req.get('User-Agent') || null
      });
    } catch (e) {
      console.warn('[Activity] failed to log complaint creation:', e.message);
    }

    return res.status(201).json({
      success: true,
      message: "Complaint created successfully",
      data,
    });
  } catch (error) {
    return res.status(mapStatusCode(error)).json({
      success: false,
      message: error.message,
      error: error.message,
    });
  }
};

export const getMyComplaints = async (req, res) => {
  try {
    const actor = getActorFromRequest(req);
    const result = await complaintService.getMyComplaints(actor, req.query);

    return res.status(200).json({
      success: true,
      message: "Complaints retrieved successfully",
      ...result,
    });
  } catch (error) {
    return res.status(mapStatusCode(error)).json({
      success: false,
      message: error.message,
      error: error.message,
    });
  }
};

export const getComplaintDetails = async (req, res) => {
  try {
    const actor = getActorFromRequest(req);
    const data = await complaintService.getComplaintDetails(req.params.ticketId, actor);

    return res.status(200).json({
      success: true,
      message: "Complaint retrieved successfully",
      data,
    });
  } catch (error) {
    return res.status(mapStatusCode(error)).json({
      success: false,
      message: error.message,
      error: error.message,
    });
  }
};

export const addMyComplaintMessage = async (req, res) => {
  try {
    const actor = getActorFromRequest(req);
    const data = await complaintService.addComplaintMessage(req.params.ticketId, req.body, actor);

    return res.status(200).json({
      success: true,
      message: "Message added successfully",
      data,
    });
  } catch (error) {
    return res.status(mapStatusCode(error)).json({
      success: false,
      message: error.message,
      error: error.message,
    });
  }
};

export const cancelMyComplaint = async (req, res) => {
  try {
    const actor = getActorFromRequest(req);
    const data = await complaintService.cancelMyComplaint(req.params.ticketId, req.body, actor);

    return res.status(200).json({
      success: true,
      message: "Complaint cancelled successfully",
      data,
    });
  } catch (error) {
    return res.status(mapStatusCode(error)).json({
      success: false,
      message: error.message,
      error: error.message,
    });
  }
};

export const getAdminComplaints = async (req, res) => {
  try {
    const actor = getActorFromRequest(req);
    const result = await complaintService.getAdminComplaints(actor, req.query);

    return res.status(200).json({
      success: true,
      message: "Admin complaints retrieved successfully",
      ...result,
    });
  } catch (error) {
    return res.status(mapStatusCode(error)).json({
      success: false,
      message: error.message,
      error: error.message,
    });
  }
};

export const getAdminComplaintDetails = async (req, res) => {
  try {
    const actor = getActorFromRequest(req);
    const data = await complaintService.getComplaintDetails(req.params.ticketId, actor);

    return res.status(200).json({
      success: true,
      message: "Admin complaint retrieved successfully",
      data,
    });
  } catch (error) {
    return res.status(mapStatusCode(error)).json({
      success: false,
      message: error.message,
      error: error.message,
    });
  }
};

export const addAdminComplaintMessage = async (req, res) => {
  try {
    const actor = getActorFromRequest(req);
    const data = await complaintService.addComplaintMessage(req.params.ticketId, req.body, actor);

    return res.status(200).json({
      success: true,
      message: "Admin message added successfully",
      data,
    });
  } catch (error) {
    return res.status(mapStatusCode(error)).json({
      success: false,
      message: error.message,
      error: error.message,
    });
  }
};

export const assignComplaint = async (req, res) => {
  try {
    const actor = getActorFromRequest(req);
    const data = await complaintService.assignComplaint(
      req.params.ticketId,
      req.body.assigneeId,
      actor
    );

    return res.status(200).json({
      success: true,
      message: "Complaint assigned successfully",
      data,
    });
  } catch (error) {
    return res.status(mapStatusCode(error)).json({
      success: false,
      message: error.message,
      error: error.message,
    });
  }
};

export const updateComplaintStatus = async (req, res) => {
  try {
    const actor = getActorFromRequest(req);
    const data = await complaintService.updateComplaintStatus(req.params.ticketId, req.body, actor);

    return res.status(200).json({
      success: true,
      message: "Complaint status updated successfully",
      data,
    });
  } catch (error) {
    return res.status(mapStatusCode(error)).json({
      success: false,
      message: error.message,
      error: error.message,
    });
  }
};

export const getComplaintStats = async (req, res) => {
  try {
    const actor = getActorFromRequest(req);
    const data = await complaintService.getComplaintStats(actor, req.query);

    return res.status(200).json({
      success: true,
      message: "Complaint statistics retrieved successfully",
      data,
    });
  } catch (error) {
    return res.status(mapStatusCode(error)).json({
      success: false,
      message: error.message,
      error: error.message,
    });
  }
};

export const exportComplaintsCsv = async (req, res) => {
  try {
    const actor = getActorFromRequest(req);
    const csv = await complaintService.exportComplaintsCsv(actor, req.query);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=complaints-${new Date().toISOString().slice(0, 10)}.csv`
    );

    return res.status(200).send(csv);
  } catch (error) {
    return res.status(mapStatusCode(error)).json({
      success: false,
      message: error.message,
      error: error.message,
    });
  }
};

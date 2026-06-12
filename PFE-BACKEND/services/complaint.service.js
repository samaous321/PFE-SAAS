import mongoose from "mongoose";
import Complaint from "../models/Complaint.js";
import User from "../models/User.js";
import { ROLES } from "../constants/roles.js";
import {
  sendComplaintAssignedEmail,
  sendComplaintCreatedEmail,
  sendComplaintResolvedEmail,
} from "./email.service.js";
import {
  notifyComplaintAssignedToAdmin,
  notifyComplaintCreatedForAdmins,
  notifyComplaintMessageToAdmins,
  notifyComplaintReplyToUser,
  notifyComplaintStatusToUser
} from "./in-app-notification.service.js";

const VALID_STATUSES = ["open", "in_progress", "pending_user", "resolved", "closed", "rejected"];
const ADMIN_STATUSES = ["in_progress", "pending_user", "resolved", "closed", "rejected"];

const PRIORITY_SLA_HOURS = {
  low: { firstResponse: 24, resolution: 120 },
  medium: { firstResponse: 12, resolution: 72 },
  high: { firstResponse: 4, resolution: 24 },
  urgent: { firstResponse: 1, resolution: 8 },
};

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toObjectId = (value) => {
  if (!value || !isValidObjectId(value)) return null;
  return new mongoose.Types.ObjectId(value);
};

const toIdString = (value) => {
  if (!value) return null;

  if (typeof value === "string") return value;

  if (typeof value === "object") {
    if (value._id) {
      return value._id.toString();
    }

    if (typeof value.toString === "function") {
      const raw = value.toString();
      if (raw && raw !== "[object Object]") {
        return raw;
      }
    }
  }

  return null;
};

const calculateSlaDates = (priority) => {
  const config = PRIORITY_SLA_HOURS[priority] || PRIORITY_SLA_HOURS.medium;
  const now = new Date();

  return {
    firstResponseDueAt: new Date(now.getTime() + config.firstResponse * 60 * 60 * 1000),
    resolutionDueAt: new Date(now.getTime() + config.resolution * 60 * 60 * 1000),
  };
};

const canReadComplaint = (complaint, actor) => {
  const complaintUserId = toIdString(complaint.requester?.userId);
  const complaintTenantId = toIdString(complaint.requester?.tenantId);
  const actorUserId = toIdString(actor.userId);
  const actorTenantId = toIdString(actor.tenantId);

  // SUPERADMIN can read all complaints
  if (actor.role === ROLES.SUPERADMIN) {
    return true;
  }

  // TENANT_ADMIN can only read complaints from their tenant
  if (actor.role === ROLES.TENANT_ADMIN) {
    if (!actorTenantId) return false;
    return complaintTenantId === actorTenantId;
  }

  // USER can only read their own complaints
  return complaintUserId === actorUserId;
};

const canWriteComplaint = (complaint, actor) => {
  const complaintUserId = toIdString(complaint.requester?.userId);
  const complaintTenantId = toIdString(complaint.requester?.tenantId);
  const actorUserId = toIdString(actor.userId);
  const actorTenantId = toIdString(actor.tenantId);

  // SUPERADMIN can write to all complaints
  if (actor.role === ROLES.SUPERADMIN) {
    return true;
  }

  // TENANT_ADMIN can only write to complaints from their tenant
  if (actor.role === ROLES.TENANT_ADMIN) {
    if (!actorTenantId) return false;
    return complaintTenantId === actorTenantId;
  }

  // USER can only write to their own complaints
  return complaintUserId === actorUserId;
};

const ensureAdmin = (actor) => {
  // Allow both SUPERADMIN and TENANT_ADMIN
  const isAdmin = actor.role === ROLES.SUPERADMIN || actor.role === ROLES.TENANT_ADMIN;
  if (!isAdmin) {
    throw new Error("Superadmin or tenant admin access required");
  }
};

const createAudit = (action, actor, details = {}) => ({
  action,
  performedBy: actor.userId,
  role: actor.role,
  details,
  at: new Date(),
});

const buildAdminQuery = (actor, filters = {}) => {
  const query = {};

  const isSuperAdmin = actor.role === ROLES.SUPERADMIN;
  const tenantFilter = isSuperAdmin ? filters.tenantId || null : filters.tenantId || actor.tenantId || null;
  if (tenantFilter) {
    const tenantId = toObjectId(tenantFilter);
    if (!tenantId) {
      throw new Error("Invalid tenantId");
    }
    query["requester.tenantId"] = tenantId;
  }

  if (filters.status && VALID_STATUSES.includes(filters.status)) {
    query.status = filters.status;
  }

  if (filters.priority) {
    query.priority = filters.priority;
  }

  if (filters.category) {
    query.category = filters.category;
  }

  if (filters.assignedTo) {
    const assignedTo = toObjectId(filters.assignedTo);
    if (!assignedTo) {
      throw new Error("Invalid assignedTo");
    }
    query.assignedTo = assignedTo;
  }

  if (filters.requesterUserId) {
    const requesterUserId = toObjectId(filters.requesterUserId);
    if (!requesterUserId) {
      throw new Error("Invalid requesterUserId");
    }
    query["requester.userId"] = requesterUserId;
  }

  if (filters.search) {
    const regex = new RegExp(escapeRegex(filters.search), "i");
    query.$or = [{ ticketId: regex }, { subject: regex }, { "requester.email": regex }];
  }

  if (filters.startDate || filters.endDate) {
    query.createdAt = {};
    if (filters.startDate) {
      query.createdAt.$gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999);
      query.createdAt.$lte = endDate;
    }
  }

  return query;
};

const buildUserQuery = (actor, filters = {}) => {
  const query = {
    "requester.userId": toObjectId(actor.userId),
  };

  if (filters.status && VALID_STATUSES.includes(filters.status)) {
    query.status = filters.status;
  }

  if (filters.priority) {
    query.priority = filters.priority;
  }

  if (filters.category) {
    query.category = filters.category;
  }

  if (filters.search) {
    const regex = new RegExp(escapeRegex(filters.search), "i");
    query.$or = [{ ticketId: regex }, { subject: regex }, { description: regex }];
  }

  return query;
};

const parsePagination = (filters = {}, defaultLimit = 20, maxLimit = 100) => {
  const page = Math.max(Number(filters.page) || 1, 1);
  const limit = Math.min(Math.max(Number(filters.limit) || defaultLimit, 1), maxLimit);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const parseSort = (sortBy = "-createdAt") => {
  const allowed = ["createdAt", "updatedAt", "lastActivityAt", "priority", "status"];
  const sanitized = String(sortBy || "-createdAt").trim();
  const field = sanitized.startsWith("-") ? sanitized.slice(1) : sanitized;

  if (!allowed.includes(field)) {
    return "-createdAt";
  }

  return sanitized;
};

const getByTicketId = async (ticketId) => {
  return Complaint.findOne({ ticketId })
    .populate("requester.userId", "firstName lastName email role")
    .populate("assignedTo", "firstName lastName email role");
};

const formatUserName = (user, fallback = "Utilisateur") => {
  const fullName = `${user?.firstName || ""} ${user?.lastName || ""}`.trim();
  return fullName || user?.fullName || user?.email || fallback;
};

const safelyNotify = async (task, label) => {
  try {
    return await task();
  } catch (error) {
    console.warn(`[Notifications] ${label} failed: ${error.message}`);
    return null;
  }
};

const getComplaintAdminUsers = async (complaint) => {
  const tenantId = complaint.requester?.tenantId || null;
  const query = {
    status: "active",
    $or: [
      { role: ROLES.SUPERADMIN },
      ...(tenantId ? [{ role: ROLES.TENANT_ADMIN, tenantId }] : [])
    ]
  };

  return User.find(query)
    .select("_id email firstName lastName role tenantId")
    .limit(50)
    .lean();
};

const baseAppUrl = process.env.APP_URL || "http://localhost:4200";

const complaintUrl = (ticketId, isAdmin = false) => {
  return isAdmin
    ? `${baseAppUrl}/admin/complaints/${ticketId}`
    : `${baseAppUrl}/user/complaints/${ticketId}`;
};

const notifyComplaintCreation = async (complaint) => {
  const requesterEmail = complaint.requester?.email;
  const requesterName = complaint.requester?.fullName;

  const jobs = [];

  if (requesterEmail) {
    jobs.push(
      sendComplaintCreatedEmail({
        recipientEmail: requesterEmail,
        recipientName: requesterName,
        ticketId: complaint.ticketId,
        complaintSubject: complaint.subject,
        category: complaint.category,
        priority: complaint.priority,
        status: complaint.status,
        requesterName,
        appUrl: complaintUrl(complaint.ticketId, false),
        forAdmin: false,
      })
    );
  }

  const admins = await getComplaintAdminUsers(complaint);

  for (const admin of admins) {
    if (!admin.email) continue;
    const adminName = formatUserName(admin, "Admin");
    jobs.push(
      sendComplaintCreatedEmail({
        recipientEmail: admin.email,
        recipientName: adminName,
        ticketId: complaint.ticketId,
        complaintSubject: complaint.subject,
        category: complaint.category,
        priority: complaint.priority,
        status: complaint.status,
        requesterName,
        appUrl: complaintUrl(complaint.ticketId, true),
        forAdmin: true,
      })
    );
  }

  await safelyNotify(
    () => notifyComplaintCreatedForAdmins({
      recipientUserIds: admins.map((admin) => admin._id),
      tenantId: complaint.requester?.tenantId,
      ticketId: complaint.ticketId,
      subject: complaint.subject,
      requesterName
    }),
    "complaint creation broadcast"
  );

  if (jobs.length > 0) {
    await Promise.allSettled(jobs);
  }
};

const notifyComplaintAssignment = async (complaint, assignee) => {
  const requesterName = complaint.requester?.fullName || "Utilisateur";

  const jobs = [];

  if (assignee?.email) {
    const assigneeName = formatUserName(assignee, "Admin");
    jobs.push(
      sendComplaintAssignedEmail({
        recipientEmail: assignee.email,
        recipientName: assigneeName,
        ticketId: complaint.ticketId,
        complaintSubject: complaint.subject,
        requesterName,
        priority: complaint.priority,
        status: complaint.status,
        appUrl: complaintUrl(complaint.ticketId, true),
      })
    );
  }

  if (complaint.requester?.email) {
    jobs.push(
      sendComplaintAssignedEmail({
        recipientEmail: complaint.requester.email,
        recipientName: complaint.requester.fullName,
        ticketId: complaint.ticketId,
        complaintSubject: complaint.subject,
        requesterName,
        priority: complaint.priority,
        status: complaint.status,
        appUrl: complaintUrl(complaint.ticketId, false),
      })
    );
  }

  if (jobs.length > 0) {
    await Promise.allSettled(jobs);
  }
};

const notifyComplaintResolution = async (complaint, reason) => {
  if (!complaint.requester?.email) return;

  await sendComplaintResolvedEmail({
    recipientEmail: complaint.requester.email,
    recipientName: complaint.requester.fullName,
    ticketId: complaint.ticketId,
    complaintSubject: complaint.subject,
    resolutionNote: reason || complaint.resolveReason || null,
    status: complaint.status,
    appUrl: complaintUrl(complaint.ticketId, false),
  });
};

export const createComplaint = async (payload, actor) => {
  const category = payload.category || "other";
  const priority = payload.priority || "medium";
  const subject = String(payload.subject || "").trim();
  const description = String(payload.description || "").trim();

  if (!subject || !description) {
    throw new Error("Subject and description are required");
  }

  const requesterProfile = await User.findById(actor.userId)
    .select("firstName lastName email tenantId")
    .lean();

  const requesterEmail = requesterProfile?.email || actor.email;
  const requesterFullName =
    `${requesterProfile?.firstName || ""} ${requesterProfile?.lastName || ""}`.trim() || actor.fullName;

  const complaint = new Complaint({
    requester: {
      userId: actor.userId,
      tenantId: requesterProfile?.tenantId || actor.tenantId || null,
      email: requesterEmail,
      fullName: requesterFullName,
    },
    category,
    priority,
    subject,
    description,
    attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    sla: calculateSlaDates(priority),
    messages: [
      {
        authorType: "user",
        authorId: actor.userId,
        message: description,
        isInternalNote: false,
        createdAt: new Date(),
      },
    ],
    counters: {
      userMessages: 1,
      adminMessages: 0,
    },
    auditTrail: [createAudit("complaint_created", actor, { category, priority })],
    lastActivityAt: new Date(),
  });

  await complaint.save();

  await notifyComplaintCreation(complaint);

  return complaint;
};

export const getMyComplaints = async (actor, filters = {}) => {
  const query = buildUserQuery(actor, filters);
  const { page, limit, skip } = parsePagination(filters, 10, 100);
  const sortBy = parseSort(filters.sortBy);

  const [items, total] = await Promise.all([
    Complaint.find(query)
      .select("ticketId category priority status subject requester lastActivityAt assignedTo createdAt updatedAt")
      .populate("assignedTo", "firstName lastName email")
      .sort(sortBy)
      .skip(skip)
      .limit(limit)
      .lean(),
    Complaint.countDocuments(query),
  ]);

  return {
    data: items,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1,
    },
  };
};

export const getComplaintDetails = async (ticketId, actor) => {
  const complaint = await getByTicketId(ticketId);
  if (!complaint) {
    throw new Error("Complaint not found");
  }

  if (!canReadComplaint(complaint, actor)) {
    throw new Error("Forbidden");
  }

  if (actor.role !== ROLES.SUPERADMIN && actor.role !== ROLES.TENANT_ADMIN) {
    complaint.messages = complaint.messages.filter((entry) => !entry.isInternalNote);
  }

  return complaint;
};

export const addComplaintMessage = async (ticketId, payload, actor) => {
  const complaint = await Complaint.findOne({ ticketId });
  if (!complaint) {
    throw new Error("Complaint not found");
  }

  if (!canWriteComplaint(complaint, actor)) {
    throw new Error("Forbidden");
  }

  const message = String(payload.message || "").trim();
  if (!message) {
    throw new Error("Message is required");
  }

  if (["closed", "rejected"].includes(complaint.status)) {
    throw new Error(`Cannot add message on ${complaint.status} complaint`);
  }

  const isAdmin = actor.role === ROLES.SUPERADMIN || actor.role === ROLES.TENANT_ADMIN;
  const isInternalNote = isAdmin ? !!payload.isInternalNote : false;

  complaint.messages.push({
    authorType: isAdmin ? "admin" : "user",
    authorId: actor.userId,
    message,
    isInternalNote,
    attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
    createdAt: new Date(),
  });

  if (isAdmin) {
    complaint.counters.adminMessages += 1;
    if (!isInternalNote) {
      if (!complaint.sla.firstRespondedAt) {
        complaint.sla.firstRespondedAt = new Date();
      }
      if (complaint.status === "open") {
        complaint.status = "in_progress";
      } else if (complaint.status === "resolved") {
        complaint.status = "pending_user";
      }
    }
  } else {
    complaint.counters.userMessages += 1;
    if (["pending_user", "resolved"].includes(complaint.status)) {
      complaint.status = "in_progress";
    }
  }

  complaint.lastActivityAt = new Date();
  complaint.auditTrail.push(
    createAudit("message_added", actor, {
      isInternalNote,
      messageLength: message.length,
    })
  );

  await complaint.save();

  if (isAdmin && !isInternalNote) {
    await safelyNotify(
      () => notifyComplaintReplyToUser({
        recipientUserId: complaint.requester?.userId,
        tenantId: complaint.requester?.tenantId,
        ticketId: complaint.ticketId,
        subject: complaint.subject,
        authorName: actor.fullName || actor.email || "Support"
      }),
      "complaint reply to user"
    );
  }

  if (!isAdmin) {
    const adminRecipientIds = complaint.assignedTo
      ? [complaint.assignedTo]
      : (await getComplaintAdminUsers(complaint)).map((admin) => admin._id);

    await safelyNotify(
      () => notifyComplaintMessageToAdmins({
        recipientUserIds: adminRecipientIds,
        tenantId: complaint.requester?.tenantId,
        ticketId: complaint.ticketId,
        subject: complaint.subject,
        authorName: actor.fullName || actor.email || "Utilisateur"
      }),
      "complaint message to admins"
    );
  }

  return complaint;
};

export const cancelMyComplaint = async (ticketId, payload, actor) => {
  const complaint = await Complaint.findOne({ ticketId });
  if (!complaint) {
    throw new Error("Complaint not found");
  }

  const isAdmin = actor.role === ROLES.SUPERADMIN || actor.role === ROLES.TENANT_ADMIN;
  if (isAdmin) {
    throw new Error("Only users can cancel their complaints");
  }

  if (!canWriteComplaint(complaint, actor)) {
    throw new Error("Forbidden");
  }

  if (!["open", "in_progress", "pending_user"].includes(complaint.status)) {
    throw new Error("Complaint cannot be cancelled in current status");
  }

  complaint.status = "closed";
  complaint.closedAt = new Date();
  complaint.cancelReason = String(payload.reason || "Cancelled by user").trim();
  complaint.lastActivityAt = new Date();
  complaint.auditTrail.push(
    createAudit("complaint_cancelled_by_user", actor, { reason: complaint.cancelReason })
  );

  await complaint.save();

  return complaint;
};

export const getAdminComplaints = async (actor, filters = {}) => {
  ensureAdmin(actor);

  const query = buildAdminQuery(actor, filters);
  const { page, limit, skip } = parsePagination(filters, 20, 200);
  const sortBy = parseSort(filters.sortBy);

  const [items, total] = await Promise.all([
    Complaint.find(query)
      .select(
        "ticketId category priority status subject requester assignedTo createdAt updatedAt lastActivityAt counters sla"
      )
      .populate("assignedTo", "firstName lastName email")
      .sort(sortBy)
      .skip(skip)
      .limit(limit)
      .lean(),
    Complaint.countDocuments(query),
  ]);

  return {
    data: items,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1,
    },
  };
};

export const assignComplaint = async (ticketId, assigneeId, actor) => {
  ensureAdmin(actor);

  const assigneeObjectId = toObjectId(assigneeId);
  if (!assigneeObjectId) {
    throw new Error("Invalid assigneeId");
  }

  const complaint = await Complaint.findOne({ ticketId });
  if (!complaint) {
    throw new Error("Complaint not found");
  }

  if (!canWriteComplaint(complaint, actor)) {
    throw new Error("Forbidden");
  }

  complaint.assignedTo = assigneeObjectId;
  if (complaint.status === "open") {
    complaint.status = "in_progress";
  }
  complaint.lastActivityAt = new Date();
  complaint.auditTrail.push(
    createAudit("complaint_assigned", actor, {
      assigneeId: assigneeObjectId.toString(),
    })
  );

  await complaint.save();

  const assignee = await User.findById(assigneeObjectId)
    .select("email firstName lastName")
    .lean();

  await notifyComplaintAssignment(complaint, assignee);
  await safelyNotify(
    () => notifyComplaintAssignedToAdmin({
      recipientUserId: assigneeObjectId,
      tenantId: complaint.requester?.tenantId,
      ticketId: complaint.ticketId,
      subject: complaint.subject,
      requesterName: complaint.requester?.fullName || "Utilisateur"
    }),
    "complaint assignment notification"
  );

  return complaint;
};

export const updateComplaintStatus = async (ticketId, payload, actor) => {
  ensureAdmin(actor);

  const nextStatus = String(payload.status || "").trim();
  if (!ADMIN_STATUSES.includes(nextStatus)) {
    throw new Error("Invalid status");
  }

  const complaint = await Complaint.findOne({ ticketId });
  if (!complaint) {
    throw new Error("Complaint not found");
  }

  if (!canWriteComplaint(complaint, actor)) {
    throw new Error("Forbidden");
  }

  const previousStatus = complaint.status;
  complaint.status = nextStatus;

  const reason = payload.reason ? String(payload.reason).trim() : null;
  if (nextStatus === "resolved") {
    complaint.sla.resolvedAt = new Date();
    if (reason) complaint.resolveReason = reason;
  }

  if (nextStatus === "rejected") {
    complaint.rejectReason = reason || "Rejected by admin";
    complaint.closedAt = new Date();
  }

  if (nextStatus === "closed") {
    complaint.closedAt = new Date();
  }

  complaint.lastActivityAt = new Date();
  complaint.auditTrail.push(
    createAudit("status_updated", actor, {
      previousStatus,
      nextStatus,
      reason,
    })
  );

  await complaint.save();

  if (nextStatus === "resolved") {
    await notifyComplaintResolution(complaint, reason);
  }

  await safelyNotify(
    () => notifyComplaintStatusToUser({
      recipientUserId: complaint.requester?.userId,
      tenantId: complaint.requester?.tenantId,
      ticketId: complaint.ticketId,
      subject: complaint.subject,
      status: nextStatus
    }),
    "complaint status update notification"
  );

  return complaint;
};

export const getComplaintStats = async (actor, filters = {}) => {
  ensureAdmin(actor);

  const query = buildAdminQuery(actor, filters);

  const [statusAgg, priorityAgg, total, openOverdue] = await Promise.all([
    Complaint.aggregate([
      { $match: query },
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Complaint.aggregate([
      { $match: query },
      { $group: { _id: "$priority", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Complaint.countDocuments(query),
    Complaint.countDocuments({
      ...query,
      status: { $in: ["open", "in_progress", "pending_user"] },
      "sla.resolutionDueAt": { $lt: new Date() },
    }),
  ]);

  return {
    total,
    openOverdue,
    byStatus: statusAgg,
    byPriority: priorityAgg,
  };
};

export const exportComplaintsCsv = async (actor, filters = {}) => {
  ensureAdmin(actor);

  const query = buildAdminQuery(actor, filters);
  const rows = await Complaint.find(query)
    .select("ticketId subject category priority status requester assignedTo createdAt updatedAt")
    .populate("assignedTo", "firstName lastName email")
    .sort("-createdAt")
    .limit(10000)
    .lean();

  const header = [
    "ticketId",
    "subject",
    "category",
    "priority",
    "status",
    "requesterEmail",
    "requesterName",
    "tenantId",
    "assignedTo",
    "createdAt",
    "updatedAt",
  ];

  const csvEscape = (value) => {
    if (value === null || value === undefined) return "";
    const text = String(value).replace(/"/g, '""');
    return `"${text}"`;
  };

  const lines = [header.join(",")];

  for (const row of rows) {
    const assignedToName = row.assignedTo
      ? `${row.assignedTo.firstName || ""} ${row.assignedTo.lastName || ""}`.trim() || row.assignedTo.email
      : "";

    lines.push(
      [
        row.ticketId,
        row.subject,
        row.category,
        row.priority,
        row.status,
        row.requester?.email || "",
        row.requester?.fullName || "",
        row.requester?.tenantId || "",
        assignedToName,
        row.createdAt?.toISOString?.() || "",
        row.updatedAt?.toISOString?.() || "",
      ]
        .map(csvEscape)
        .join(",")
    );
  }

  return lines.join("\n");
};

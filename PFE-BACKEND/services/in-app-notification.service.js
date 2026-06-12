import mongoose from "mongoose";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import {
  emitNotificationEvent
} from "./notification-stream.service.js";

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 24;
const DEFAULT_WEEKS = 8;

const toObjectId = (value) => {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) {
    return null;
  }

  return new mongoose.Types.ObjectId(value);
};

const toIdString = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object" && value._id) {
    return String(value._id);
  }

  if (typeof value?.toString === "function") {
    const raw = value.toString();
    return raw && raw !== "[object Object]" ? raw : null;
  }

  return null;
};

const dedupeRecipientIds = (values = []) => {
  return [...new Set(values.map((value) => toIdString(value)).filter(Boolean))];
};

const serializeNotification = (notification) => ({
  _id: String(notification._id),
  recipientUserId: toIdString(notification.recipientUserId),
  tenantId: toIdString(notification.tenantId),
  type: notification.type,
  title: notification.title,
  message: notification.message,
  tone: notification.tone,
  iconKey: notification.iconKey || "notification",
  action: notification.action || {},
  metadata: notification.metadata || {},
  createdAt: notification.createdAt,
  updatedAt: notification.updatedAt,
  readAt: notification.readAt,
  unread: !notification.readAt
});

const sanitizeQueryParams = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce((accumulator, [key, item]) => {
    if (item === null || item === undefined || item === "") {
      return accumulator;
    }

    accumulator[key] = item;
    return accumulator;
  }, {});
};

export const createNotifications = async (payloads = []) => {
  const documents = payloads
    .map((payload) => {
      const recipientUserId = toObjectId(payload.recipientUserId);
      const tenantId = toObjectId(payload.tenantId);

      if (!recipientUserId || !payload?.title || !payload?.message || !payload?.type) {
        console.warn("[Notification] Skipping invalid payload: missing recipientUserId or title/message/type");
        return null;
      }

      return {
        recipientUserId,
        tenantId,
        type: String(payload.type),
        title: String(payload.title).trim(),
        message: String(payload.message).trim(),
        tone: payload.tone || "info",
        iconKey: payload.iconKey || "notification",
        action: {
          label: String(payload.action?.label || "").trim(),
          kind: String(payload.action?.kind || "").trim(),
          entityId: String(payload.action?.entityId || "").trim(),
          queryParams: sanitizeQueryParams(payload.action?.queryParams)
        },
        metadata: payload.metadata || {}
      };
    })
    .filter(Boolean);

  if (documents.length === 0) {
    console.warn("[Notification] No valid documents to insert");
    return [];
  }

  try {
    const created = await Notification.insertMany(documents, { ordered: false });
    console.log("[Notification] Inserted", created.length, "notifications into database");
    
    const serialized = created.map((notification) => serializeNotification(notification.toObject()));

    for (const notification of serialized) {
      console.log("[Notification] Emitting event for user:", notification.recipientUserId, "type:", notification.type);
      emitNotificationEvent(notification.recipientUserId, notification);
    }

    return serialized;
  } catch (error) {
    console.error("[Notification] Error creating notifications:", error.message);
    throw error;
  }
};

export const createNotification = async (payload) => {
  const [notification] = await createNotifications([payload]);
  return notification || null;
};

export const getUserNotifications = async (actor, options = {}) => {
  const recipientUserId = toObjectId(actor?.userId || actor?._id);

  if (!recipientUserId) {
    throw new Error("Unauthorized");
  }

  const limit = Math.min(
    Math.max(Number(options.limit) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );
  const weeks = Math.max(Number(options.weeks) || DEFAULT_WEEKS, 1);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (weeks * 7));
  startDate.setHours(0, 0, 0, 0);

  const [items, unreadCount] = await Promise.all([
    Notification.find({
      recipientUserId,
      createdAt: { $gte: startDate }
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
    Notification.countDocuments({
      recipientUserId,
      readAt: null
    })
  ]);

  return {
    items: items.map((item) => serializeNotification(item)),
    unreadCount
  };
};

export const markNotificationRead = async (actor, notificationId) => {
  const recipientUserId = toObjectId(actor?.userId || actor?._id);
  const targetId = toObjectId(notificationId);

  if (!recipientUserId || !targetId) {
    throw new Error("Invalid notificationId");
  }

  const notification = await Notification.findOneAndUpdate(
    { _id: targetId, recipientUserId },
    {
      $set: {
        readAt: new Date()
      }
    },
    { new: true }
  ).lean();

  if (!notification) {
    throw new Error("Notification not found");
  }

  return serializeNotification(notification);
};

export const markAllNotificationsRead = async (actor) => {
  const recipientUserId = toObjectId(actor?.userId || actor?._id);

  if (!recipientUserId) {
    throw new Error("Unauthorized");
  }

  await Notification.updateMany(
    {
      recipientUserId,
      readAt: null
    },
    {
      $set: {
        readAt: new Date()
      }
    }
  );

  return { success: true };
};

const QUOTA_DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

const getQuotaRecipients = async (tenantId) => {
  const tenantObjectId = toObjectId(tenantId);

  if (!tenantObjectId) {
    console.warn("[Quota Notification] Invalid tenantId:", tenantId);
    return [];
  }

  try {
    const [superAdmins, tenantAdmins] = await Promise.all([
      User.find({ role: "superadmin" }).select("_id").lean(),
      User.find({ tenantId: tenantObjectId, role: "tenant_admin" }).select("_id").lean()
    ]);

    const recipientIds = [
      ...superAdmins.map((user) => String(user._id)),
      ...tenantAdmins.map((user) => String(user._id))
    ];

    const unique = [...new Set(recipientIds)];
    console.log(`[Quota Notification] Found ${unique.length} recipients for tenantId ${tenantId}: ${superAdmins.length} SUPERADMIN, ${tenantAdmins.length} TENANT_ADMIN`);
    return unique;
  } catch (error) {
    console.error("[Quota Notification] Error finding recipients:", error.message);
    return [];
  }
};

const hasRecentQuotaNotification = async ({ recipientUserId, tenantId, alert, resourceType }) => {
  const duplicateWindowStart = new Date(Date.now() - QUOTA_DUPLICATE_WINDOW_MS);

  return Notification.exists({
    recipientUserId: toObjectId(recipientUserId),
    tenantId: toObjectId(tenantId),
    type: "quota",
    "metadata.alertKey": alert.key,
    "metadata.threshold": alert.threshold,
    "metadata.resourceType": resourceType,
    createdAt: { $gte: duplicateWindowStart }
  });
};

export const notifyQuotaThresholdReached = async ({
  tenantId,
  tenantName,
  subscriptionPlan,
  resourceType,
  alerts = []
}) => {
  try {
    console.log("[Quota Notification] Starting quota notification for tenantId:", tenantId, "alerts:", alerts.length);
    
    if (!tenantId || !Array.isArray(alerts) || alerts.length === 0) {
      console.warn("[Quota Notification] Missing required data: tenantId=", tenantId, "alerts=", alerts);
      return [];
    }

    const recipientIds = await getQuotaRecipients(tenantId);
    if (recipientIds.length === 0) {
      console.warn("[Quota Notification] No recipients found for tenantId:", tenantId);
      return [];
    }

    console.log("[Quota Notification] Processing notifications for", recipientIds.length, "recipients");

    const dedupedPayloads = [];

    for (const recipientUserId of recipientIds) {
      for (const alert of alerts) {
        const alreadyNotified = await hasRecentQuotaNotification({
          recipientUserId,
          tenantId,
          alert,
          resourceType
        });

        if (alreadyNotified) {
          console.log("[Quota Notification] Skipping duplicate for user:", recipientUserId, "alert:", alert.key);
          continue;
        }

        const severityTone = alert.severity === "full" || alert.severity === "critical" ? "danger" : "warning";
        const quotaLabel = alert.label || "quota";
        const tenantLabel = tenantName ? ` pour ${tenantName}` : "";
        const severityLabel = alert.severity === "full"
          ? "100%"
          : alert.severity === "critical"
            ? "90%"
            : "80%";

        const payload = {
          recipientUserId,
          tenantId,
          type: "quota",
          title: alert.severity === "full"
            ? `Quota atteint${tenantLabel}`
            : `Quota surveille${tenantLabel}`,
          message: `Le ${quotaLabel} du tenant${tenantLabel} a atteint ${severityLabel} d'utilisation sur le plan ${String(subscriptionPlan || "small").toUpperCase()}.`,
          tone: severityTone,
          iconKey: "quota",
          action: {
            label: "Voir le tenant",
            kind: "tenant_quota_detail",
            entityId: String(tenantId)
          },
          metadata: {
            tenantId: String(tenantId),
            tenantName: tenantName || null,
            subscriptionPlan: subscriptionPlan || null,
            resourceType,
            alertKey: alert.key,
            alertLabel: quotaLabel,
            severity: alert.severity,
            threshold: alert.threshold,
            percent: alert.percent,
            used: alert.used,
            limit: alert.limit
          }
        };
        
        console.log("[Quota Notification] Adding payload for user:", recipientUserId, "severity:", alert.severity);
        dedupedPayloads.push(payload);
      }
    }

    if (dedupedPayloads.length === 0) {
      console.warn("[Quota Notification] No payloads to send after dedup");
      return [];
    }

    console.log("[Quota Notification] Creating", dedupedPayloads.length, "notifications");
    const created = await createNotifications(dedupedPayloads);
    console.log("[Quota Notification] Successfully created", created.length, "notifications");
    
    return created;
  } catch (error) {
    console.error("[Quota Notification] Error:", error.message, error.stack);
    return [];
  }
};

export const notifyFileReceived = async ({
  recipientUserIds = [],
  tenantId,
  senderName,
  fileId,
  fileName
}) => {
  const ids = dedupeRecipientIds(recipientUserIds);

  return createNotifications(
    ids.map((recipientUserId) => ({
      recipientUserId,
      tenantId,
      type: "file_received",
      title: "Nouveau fichier recu",
      message: `${senderName} a partage "${fileName}" avec vous.`,
      tone: "success",
      iconKey: "share",
      action: {
        label: "Voir le partage",
        kind: "received_shares",
        entityId: fileId
      },
      metadata: {
        fileId: toIdString(fileId),
        fileName
      }
    }))
  );
};

export const notifySecurityAlert = async ({
  recipientUserIds = [],
  tenantId,
  fileId,
  fileName,
  ownerName,
  threatLevel
}) => {
  const ids = dedupeRecipientIds(recipientUserIds);
  const normalizedThreat = String(threatLevel || "medium").toLowerCase();
  const tone = normalizedThreat === "critical" || normalizedThreat === "high"
    ? "danger"
    : "warning";

  return createNotifications(
    ids.map((recipientUserId) => ({
      recipientUserId,
      tenantId,
      type: "security_alert",
      title: "Alerte securite",
      message: `Le fichier "${fileName}" de ${ownerName} a ete signale pour verification.`,
      tone,
      iconKey: "alert",
      action: {
        label: "Voir l alerte",
        kind: "security_alert_detail",
        entityId: fileId,
        queryParams: { fileId: toIdString(fileId) }
      },
      metadata: {
        fileId: toIdString(fileId),
        fileName,
        threatLevel: normalizedThreat
      }
    }))
  );
};

export const notifyFileReviewOutcome = async ({
  ownerUserId,
  tenantId,
  fileId,
  fileName,
  action,
  adminName
}) => {
  const normalizedAction = String(action || "").toLowerCase();

  if (!["whitelist", "block"].includes(normalizedAction)) {
    return null;
  }

  const isApproved = normalizedAction === "whitelist";

  return createNotification({
    recipientUserId: ownerUserId,
    tenantId,
    type: isApproved ? "file_approved" : "file_blocked",
    title: isApproved ? "Fichier approuve par admin" : "Fichier bloque par admin",
    message: isApproved
      ? `${adminName} a approuve "${fileName}" apres investigation.`
      : `${adminName} a bloque "${fileName}" apres investigation.`,
    tone: isApproved ? "success" : "danger",
    iconKey: isApproved ? "approval" : "alert",
    action: {
      label: "Ouvrir mes fichiers",
      kind: "file_workspace",
      entityId: fileId
    },
    metadata: {
      fileId: toIdString(fileId),
      fileName,
      action: normalizedAction
    }
  });
};

export const notifyComplaintCreatedForAdmins = async ({
  recipientUserIds = [],
  tenantId,
  ticketId,
  subject,
  requesterName
}) => {
  const ids = dedupeRecipientIds(recipientUserIds);

  return createNotifications(
    ids.map((recipientUserId) => ({
      recipientUserId,
      tenantId,
      type: "complaint_created",
      title: "Nouvelle reclamation",
      message: `${requesterName} a soumis "${subject}".`,
      tone: "warning",
      iconKey: "complaint",
      action: {
        label: "Voir la reclamation",
        kind: "complaint_detail",
        entityId: ticketId
      },
      metadata: {
        ticketId,
        subject
      }
    }))
  );
};

export const notifyComplaintReplyToUser = async ({
  recipientUserId,
  tenantId,
  ticketId,
  subject,
  authorName
}) => {
  return createNotification({
    recipientUserId,
    tenantId,
    type: "complaint_reply",
    title: "Nouvelle reponse a votre reclamation",
    message: `${authorName} a repondu sur "${subject}".`,
    tone: "info",
    iconKey: "complaint",
    action: {
      label: "Voir la reponse",
      kind: "complaint_detail",
      entityId: ticketId
    },
    metadata: {
      ticketId,
      subject
    }
  });
};

export const notifyComplaintMessageToAdmins = async ({
  recipientUserIds = [],
  tenantId,
  ticketId,
  subject,
  authorName
}) => {
  const ids = dedupeRecipientIds(recipientUserIds);

  return createNotifications(
    ids.map((recipientUserId) => ({
      recipientUserId,
      tenantId,
      type: "complaint_message",
      title: "Nouveau message reclamation",
      message: `${authorName} a ajoute un message sur "${subject}".`,
      tone: "info",
      iconKey: "complaint",
      action: {
        label: "Ouvrir la reclamation",
        kind: "complaint_detail",
        entityId: ticketId
      },
      metadata: {
        ticketId,
        subject
      }
    }))
  );
};

export const notifyComplaintAssignedToAdmin = async ({
  recipientUserId,
  tenantId,
  ticketId,
  subject,
  requesterName
}) => {
  return createNotification({
    recipientUserId,
    tenantId,
    type: "complaint_assigned",
    title: "Reclamation assignee",
    message: `${requesterName} vous a ete assigne sur "${subject}".`,
    tone: "warning",
    iconKey: "complaint",
    action: {
      label: "Traiter la reclamation",
      kind: "complaint_detail",
      entityId: ticketId
    },
    metadata: {
      ticketId,
      subject
    }
  });
};

export const notifyComplaintStatusToUser = async ({
  recipientUserId,
  tenantId,
  ticketId,
  subject,
  status
}) => {
  const normalizedStatus = String(status || "").toLowerCase();
  const statusLabels = {
    in_progress: "en cours",
    pending_user: "en attente de votre retour",
    resolved: "resolue",
    closed: "cloturee",
    rejected: "rejetee"
  };
  const label = statusLabels[normalizedStatus] || normalizedStatus;

  return createNotification({
    recipientUserId,
    tenantId,
    type: "complaint_status",
    title: "Statut de reclamation mis a jour",
    message: `Votre reclamation "${subject}" est maintenant ${label}.`,
    tone: normalizedStatus === "resolved" ? "success" : normalizedStatus === "rejected" ? "danger" : "info",
    iconKey: "complaint",
    action: {
      label: "Voir la reclamation",
      kind: "complaint_detail",
      entityId: ticketId
    },
    metadata: {
      ticketId,
      subject,
      status: normalizedStatus
    }
  });
};

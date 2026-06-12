import jwt from "jsonwebtoken";
import {
  getUserNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from "../services/in-app-notification.service.js";
import {
  emitNotificationHeartbeat,
  registerNotificationStream,
  sendNotificationStreamReady,
  unregisterNotificationStream
} from "../services/notification-stream.service.js";

const getActorFromRequest = (req) => {
  const userId = req.user?.userId || req.user?._id || req.user?.id;

  if (!userId) {
    throw new Error("Unauthorized");
  }

  return {
    userId: userId.toString(),
    tenantId: req.user?.tenantId ? req.user.tenantId.toString() : null,
    role: req.user?.role || "user"
  };
};

const getActorFromStreamRequest = (req) => {
  const token = String(req.query?.token || "").trim();

  if (!token) {
    throw new Error("Unauthorized");
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const userId = decoded?.userId || decoded?._id || decoded?.id;

  if (!userId) {
    throw new Error("Unauthorized");
  }

  return {
    userId: userId.toString(),
    tenantId: decoded?.tenantId ? String(decoded.tenantId) : null,
    role: decoded?.role || "user"
  };
};

const mapStatusCode = (error) => {
  const message = String(error?.message || "");

  if (message === "Unauthorized") return 401;
  if (message === "Notification not found") return 404;
  if (message.includes("Invalid")) return 400;

  return 500;
};

export const getMyNotifications = async (req, res) => {
  try {
    const actor = getActorFromRequest(req);
    const result = await getUserNotifications(actor, req.query);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(mapStatusCode(error)).json({
      success: false,
      message: error.message
    });
  }
};

export const markMyNotificationRead = async (req, res) => {
  try {
    const actor = getActorFromRequest(req);
    const notification = await markNotificationRead(actor, req.params.notificationId);
    return res.status(200).json({
      success: true,
      item: notification
    });
  } catch (error) {
    return res.status(mapStatusCode(error)).json({
      success: false,
      message: error.message
    });
  }
};

export const markMyNotificationsRead = async (req, res) => {
  try {
    const actor = getActorFromRequest(req);
    await markAllNotificationsRead(actor);
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(mapStatusCode(error)).json({
      success: false,
      message: error.message
    });
  }
};

export const streamMyNotifications = async (req, res) => {
  let actor = null;
  let heartbeat = null;

  try {
    actor = getActorFromStreamRequest(req);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    registerNotificationStream(actor.userId, res);
    sendNotificationStreamReady(res);

    heartbeat = setInterval(() => {
      emitNotificationHeartbeat(actor.userId);
    }, 25000);

    req.on("close", () => {
      if (heartbeat) {
        clearInterval(heartbeat);
      }

      unregisterNotificationStream(actor.userId, res);
      res.end();
    });
  } catch (error) {
    if (heartbeat) {
      clearInterval(heartbeat);
    }

    return res.status(mapStatusCode(error)).json({
      success: false,
      message: error.message
    });
  }
};

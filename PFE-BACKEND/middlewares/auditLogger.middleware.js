import ShareHistory from "../models/ShareHistory.js";

/**
 * Middleware pour logger tous les accès aux partages
 */
export const auditShareAccess = async (req, res, next) => {
  const originalJson = res.json;

  res.json = async function(data) {
    // Capturer les tentatives d'accès aux partages
    if (req.path.includes("/shares/") && req.method === "GET") {
      const shareId = req.params.shareId;
      
      if (shareId && data.success) {
        try {
          const accessLog = {
            timestamp: new Date(),
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get("user-agent"),
            action: req.query.action || "view",
            success: true
          };

          await ShareHistory.findOneAndUpdate(
            { shareId },
            {
              $push: { accessLogs: accessLog },
              $set: { lastAccessedAt: new Date() }
            }
          );
        } catch (error) {
          console.error("[AuditLogger] Error logging access:", error.message);
        }
      }
    }

    return originalJson.call(this, data);
  };

  next();
};

export default auditShareAccess;
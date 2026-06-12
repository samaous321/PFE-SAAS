import crypto from "crypto";

/**
 * Générer un ID unique pour un partage
 */
export const generateUniqueId = () => {
  return `share_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
};

/**
 * Formater les données d'accès pour le log
 */
export const formatAccessLog = (req, action = "view") => {
  return {
    action,
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get("user-agent") || "Unknown",
    timestamp: new Date()
  };
};

/**
 * Vérifier si un partage a expiré
 */
export const isShareExpired = (expiresAt) => {
  if (!expiresAt) return false;
  return new Date() > new Date(expiresAt);
};

/**
 * Vérifier le quota de téléchargements
 */
export const isDownloadQuotaExceeded = (current, max) => {
  if (max === null || max === undefined) return false;
  return current >= max;
};

/**
 * Générer un résumé statistique
 */
export const generateShareSummary = (shareData) => {
  return {
    totalAccess: shareData.downloadCount + shareData.viewCount,
    downloads: shareData.downloadCount,
    views: shareData.viewCount,
    status: shareData.status,
    isExpired: isShareExpired(shareData.expiresAt),
    daysActive: Math.floor(
      (new Date() - new Date(shareData.createdAt)) / (1000 * 60 * 60 * 24)
    ),
    quotaUsed: shareData.maxDownloads 
      ? `${shareData.downloadCount}/${shareData.maxDownloads}`
      : "Unlimited"
  };
};

export default {
  generateUniqueId,
  formatAccessLog,
  isShareExpired,
  isDownloadQuotaExceeded,
  generateShareSummary
};
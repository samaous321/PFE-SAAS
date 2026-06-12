import mongoose from "mongoose";
import User from "../models/User.js";
import Tenant from "../models/Tenant.js";
import File from "../models/File.js";
import ShareHistory from "../models/ShareHistory.js";
import { ROLES } from "../constants/roles.js";
import { getEffectiveQuotaPolicy } from "./quota.service.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const formatDateKey = (date) => date.toISOString().slice(0, 10);

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeEndDate = (date) => {
  if (!date) return null;
  const normalized = new Date(date);
  normalized.setHours(23, 59, 59, 999);
  return normalized;
};

const toObjectId = (value) => {
  if (!value) return null;
  const normalized = String(value);
  return mongoose.Types.ObjectId.isValid(normalized)
    ? new mongoose.Types.ObjectId(normalized)
    : null;
};

const isWithinRange = (value, startDate, endDate) => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;
  return true;
};

const getWeekStart = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return date;
};

const createTimeBuckets = (startDate, endDate, unit) => {
  const buckets = new Map();
  if (!startDate || !endDate) {
    return buckets;
  }

  if (unit === "week") {
    const cursor = getWeekStart(startDate);
    const finalDate = new Date(endDate);
    while (cursor <= finalDate) {
      const key = formatDateKey(cursor);
      buckets.set(key, { period: key, uploads: 0, shares: 0, downloads: 0 });
      cursor.setDate(cursor.getDate() + 7);
    }
    return buckets;
  }

  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);
  const finalDate = new Date(endDate);
  finalDate.setHours(23, 59, 59, 999);

  while (cursor <= finalDate) {
    const key = formatDateKey(cursor);
    buckets.set(key, { period: key, uploads: 0, shares: 0, downloads: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  return buckets;
};

const incrementBucket = (buckets, value, field, unit) => {
  if (!value) return;

  const date = unit === "week" ? getWeekStart(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return;

  if (unit !== "week") {
    date.setHours(0, 0, 0, 0);
  }

  const key = formatDateKey(date);
  if (!buckets.has(key)) {
    buckets.set(key, { period: key, uploads: 0, shares: 0, downloads: 0 });
  }

  const bucket = buckets.get(key);
  bucket[field] += 1;
};

const toSortedSeries = (buckets) => [...buckets.values()].sort((left, right) => left.period.localeCompare(right.period));

const getTenantStorageLimit = (tenant) => {
  const storageBytes = getEffectiveQuotaPolicy(tenant)?.tenant?.storageBytes;
  return typeof storageBytes === "number" && Number.isFinite(storageBytes)
    ? storageBytes
    : null;
};

const getUsagePercent = (used, limit) => {
  if (!limit || limit <= 0) {
    return null;
  }

  return Math.min((used / limit) * 100, 100);
};

const getThreatClassification = (file) => {
  const status = String(file?.status || "").toLowerCase();
  const quarantine = String(file?.scanMetadata?.quarantineStatus || "").toLowerCase();
  const infected = Boolean(file?.scanMetadata?.clamavResult?.isInfected) || Boolean(file?.scanMetadata?.virustotalResult?.isInfected);
  const suspiciousStatus = String(file?.scanStatus || "").toLowerCase();

  if (status === "blocked") {
    return { blocked: 1, quarantined: 0, suspicious: 0 };
  }

  if (status === "quarantined" || quarantine === "quarantined") {
    return { blocked: 0, quarantined: 1, suspicious: 0 };
  }

  if (infected || (suspiciousStatus && !["clean", "pending"].includes(suspiciousStatus))) {
    return { blocked: 0, quarantined: 0, suspicious: 1 };
  }

  return { blocked: 0, quarantined: 0, suspicious: 0 };
};

const buildFileMatch = (filters, tenantIds, options = {}) => {
  const { includeDate = true } = options;
  const match = {};

  if (tenantIds?.length) {
    match.tenantId = { $in: tenantIds };
  }

  if (includeDate) {
    const startDate = parseDate(filters.startDate);
    const endDate = normalizeEndDate(parseDate(filters.endDate));
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = startDate;
      if (endDate) match.createdAt.$lte = endDate;
    }
  }

  if (filters.fileType) {
    match.mimeType = { $regex: filters.fileType, $options: "i" };
  }

  if (filters.status) {
    match.status = filters.status;
  }

  return match;
};

const buildShareMatch = (filters, tenantIds, options = {}) => {
  const { includeDate = true } = options;
  const match = {};

  if (tenantIds?.length) {
    match["sharedBy.tenantId"] = { $in: tenantIds };
  }

  if (includeDate) {
    const startDate = parseDate(filters.startDate);
    const endDate = normalizeEndDate(parseDate(filters.endDate));
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = startDate;
      if (endDate) match.createdAt.$lte = endDate;
    }
  }

  if (filters.fileType) {
    match.mimeType = { $regex: filters.fileType, $options: "i" };
  }

  if (filters.status) {
    match.status = filters.status;
  }

  return match;
};

const resolveMatchedTenants = async (requester, filters = {}) => {
  const query = {};

  if (requester?.role === ROLES.TENANT_ADMIN) {
    const requesterTenantId = toObjectId(requester.tenantId);
    if (!requesterTenantId) {
      return [];
    }
    query._id = requesterTenantId;
  } else if (requester?.role !== ROLES.SUPERADMIN) {
    throw new Error("Access denied");
  }

  if (filters.tenantId) {
    const filteredTenantId = toObjectId(filters.tenantId);
    if (!filteredTenantId) {
      return [];
    }

    if (query._id && String(query._id) !== String(filteredTenantId)) {
      return [];
    }

    query._id = filteredTenantId;
  }

  if (filters.tenantName) {
    query.name = { $regex: filters.tenantName, $options: "i" };
  }

  return Tenant.find(query).lean();
};

const buildEmptyAdminStatsReport = () => ({
  global: {
    totalTenants: 0,
    totalUsers: 0,
    totalFiles: 0,
    totalStorageUsed: 0,
    totalStorageLimit: 0,
    totalUploads: 0,
    totalDownloads: 0,
    totalShares: 0
  },
  tenants: [],
  security: {
    totals: {
      blocked: 0,
      suspicious: 0,
      quarantined: 0
    },
    perTenant: []
  },
  activity: {
    daily: [],
    weekly: [],
    uploads: 0,
    downloads: 0,
    shares: 0
  },
  storage: {
    usagePerTenant: [],
    topStorageConsumers: [],
    tenantsNearQuota: []
  },
  insights: {
    mostActiveTenants: [],
    mostSuspiciousTenants: [],
    highestStorageTenants: []
  },
  alerts: []
});

const logAdminAction = async () => undefined;

export const getDashboardStats = async (requester) => {
  const matchedTenants = await resolveMatchedTenants(requester);

  if (matchedTenants.length === 0) {
    return {
      totalUsers: 0,
      totalTenants: 0,
      totalFiles: 0,
      totalStorageUsed: 0,
      totalStorageLimit: 0,
      activeUsers: 0,
      recentUsers: [],
      recentTenants: [],
      malwareDetected: 0,
      uploadsByDay: [],
      storageByTenant: []
    };
  }

  const tenantIds = matchedTenants.map((tenant) => tenant._id);
  const tenantIdSet = new Set(tenantIds.map((tenantId) => String(tenantId)));
  const tenantLimits = new Map(
    matchedTenants.map((tenant) => [String(tenant._id), getTenantStorageLimit(tenant) || 0])
  );
  const tenantNames = new Map(
    matchedTenants.map((tenant) => [String(tenant._id), tenant.name || "Tenant"])
  );

  const thirtyDaysAgo = new Date(Date.now() - (29 * DAY_MS));
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const [totalUsers, activeUsers, recentUsers, fileFacet, malwareStats, storageAggregation] = await Promise.all([
    User.countDocuments({ tenantId: { $in: tenantIds } }),
    User.countDocuments({ tenantId: { $in: tenantIds }, status: "active" }),
    User.find({ tenantId: { $in: tenantIds } })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    File.aggregate([
      { $match: { tenantId: { $in: tenantIds } } },
      {
        $facet: {
          global: [
            {
              $group: {
                _id: null,
                totalFiles: { $sum: 1 },
                totalStorageUsed: { $sum: { $ifNull: ["$size", 0] } }
              }
            }
          ],
          byDay: [
            { $match: { createdAt: { $gte: thirtyDaysAgo } } },
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                count: { $sum: 1 }
              }
            },
            { $sort: { _id: 1 } }
          ]
        }
      }
    ]),
    File.aggregate([
      {
        $match: {
          tenantId: { $in: tenantIds },
          $or: [
            { status: "blocked" },
            { status: "quarantined" },
            { "scanMetadata.quarantineStatus": "quarantined" },
            { "scanMetadata.clamavResult.isInfected": true },
            { "scanMetadata.virustotalResult.isInfected": true }
          ]
        }
      },
      { $count: "count" }
    ]),
    File.aggregate([
      { $match: { tenantId: { $in: tenantIds } } },
      {
        $group: {
          _id: "$tenantId",
          used: { $sum: { $ifNull: ["$size", 0] } }
        }
      }
    ])
  ]);

  const uploadsByDay = (fileFacet[0]?.byDay || []).map((entry) => ({
    date: entry._id,
    count: entry.count
  }));

  const storageByTenant = storageAggregation
    .filter((entry) => tenantIdSet.has(String(entry._id)))
    .map((entry) => {
      const tenantId = String(entry._id);
      return {
        tenantId,
        name: tenantNames.get(tenantId) || "Tenant",
        used: entry.used || 0,
        limit: tenantLimits.get(tenantId) || 0
      };
    });

  return {
    totalUsers,
    totalTenants: matchedTenants.length,
    totalFiles: fileFacet[0]?.global?.[0]?.totalFiles || 0,
    totalStorageUsed: fileFacet[0]?.global?.[0]?.totalStorageUsed || 0,
    totalStorageLimit: matchedTenants.reduce((sum, tenant) => sum + (getTenantStorageLimit(tenant) || 0), 0),
    activeUsers,
    recentUsers,
    recentTenants: [...matchedTenants]
      .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime())
      .slice(0, 5),
    malwareDetected: malwareStats[0]?.count || 0,
    uploadsByDay,
    storageByTenant
  };
};

export const getAdminStatsReport = async (requester, filters = {}) => {
  const matchedTenants = await resolveMatchedTenants(requester, filters);
  if (matchedTenants.length === 0) {
    return buildEmptyAdminStatsReport();
  }

  const tenantIds = matchedTenants.map((tenant) => tenant._id);
  const tenantReports = new Map();
  const totalStorageLimit = matchedTenants.reduce((sum, tenant) => sum + (getTenantStorageLimit(tenant) || 0), 0);

  for (const tenant of matchedTenants) {
    const storageLimitBytes = getTenantStorageLimit(tenant);
    tenantReports.set(String(tenant._id), {
      tenantId: String(tenant._id),
      tenantName: tenant.name || "Tenant",
      usersCount: 0,
      filesCount: 0,
      storageUsedBytes: 0,
      storageLimitBytes,
      storageUsagePercent: null,
      activityScore: 0,
      lastActivity: null,
      suspicious: 0,
      blocked: 0,
      quarantined: 0,
      _uploads: 0,
      _shares: 0,
      _downloads: 0
    });
  }

  const startDate = parseDate(filters.startDate) || new Date(Date.now() - (29 * DAY_MS));
  startDate.setHours(0, 0, 0, 0);
  const endDate = normalizeEndDate(parseDate(filters.endDate)) || new Date();

  const dailyBuckets = createTimeBuckets(startDate, endDate, "day");
  const weeklyBuckets = createTimeBuckets(startDate, endDate, "week");

  const [users, scopedFiles, scopedShares] = await Promise.all([
    User.find({ tenantId: { $in: tenantIds } })
      .select("tenantId role status verified createdAt lastLogin")
      .lean(),
    File.find(buildFileMatch(filters, tenantIds, { includeDate: false }))
      .select("tenantId size status scanStatus createdAt updatedAt scannedAt downloadCount scanMetadata")
      .lean(),
    ShareHistory.find(buildShareMatch(filters, tenantIds, { includeDate: false }))
      .select("createdAt lastAccessedAt downloadCount accessLogs sharedBy mimeType status")
      .lean()
  ]);

  let totalUploads = 0;
  let totalShares = 0;
  let totalDownloads = 0;
  let activeUsers = 0;
  let verifiedUsers = 0;
  let adminUsers = 0;

  for (const user of users) {
    const tenantId = String(user.tenantId || "");
    const tenantReport = tenantReports.get(tenantId);
    if (!tenantReport) continue;

    tenantReport.usersCount += 1;
    if (String(user.status || "").toLowerCase() === "active") {
      activeUsers += 1;
    }
    if (user.verified) {
      verifiedUsers += 1;
    }
    if ([ROLES.SUPERADMIN, ROLES.TENANT_ADMIN].includes(user.role)) {
      adminUsers += 1;
    }
    if (user.lastLogin && (!tenantReport.lastActivity || new Date(user.lastLogin) > new Date(tenantReport.lastActivity))) {
      tenantReport.lastActivity = new Date(user.lastLogin).toISOString();
    }
  }

  for (const file of scopedFiles) {
    const tenantId = String(file.tenantId || "");
    const tenantReport = tenantReports.get(tenantId);
    if (!tenantReport) continue;

    const fileSize = Number(file.size || 0);
    tenantReport.filesCount += 1;
    tenantReport.storageUsedBytes += fileSize;

    const classification = getThreatClassification(file);
    tenantReport.blocked += classification.blocked;
    tenantReport.quarantined += classification.quarantined;
    tenantReport.suspicious += classification.suspicious;

    const candidateActivityDate = file.updatedAt || file.scannedAt || file.createdAt;
    if (candidateActivityDate && (!tenantReport.lastActivity || new Date(candidateActivityDate) > new Date(tenantReport.lastActivity))) {
      tenantReport.lastActivity = new Date(candidateActivityDate).toISOString();
    }

    if (isWithinRange(file.createdAt, startDate, endDate)) {
      totalUploads += 1;
      tenantReport._uploads += 1;
      incrementBucket(dailyBuckets, file.createdAt, "uploads", "day");
      incrementBucket(weeklyBuckets, file.createdAt, "uploads", "week");
    }
  }

  for (const share of scopedShares) {
    const tenantId = String(share?.sharedBy?.tenantId || "");
    const tenantReport = tenantReports.get(tenantId);
    if (!tenantReport) continue;

    if (share.createdAt && (!tenantReport.lastActivity || new Date(share.createdAt) > new Date(tenantReport.lastActivity))) {
      tenantReport.lastActivity = new Date(share.createdAt).toISOString();
    }
    if (share.lastAccessedAt && (!tenantReport.lastActivity || new Date(share.lastAccessedAt) > new Date(tenantReport.lastActivity))) {
      tenantReport.lastActivity = new Date(share.lastAccessedAt).toISOString();
    }

    if (isWithinRange(share.createdAt, startDate, endDate)) {
      totalShares += 1;
      tenantReport._shares += 1;
      incrementBucket(dailyBuckets, share.createdAt, "shares", "day");
      incrementBucket(weeklyBuckets, share.createdAt, "shares", "week");
    }

    let shareDownloads = 0;
    if (Array.isArray(share.accessLogs) && share.accessLogs.length > 0) {
      for (const accessLog of share.accessLogs) {
        if (String(accessLog?.action || "").toLowerCase() !== "download") {
          continue;
        }

        if (!isWithinRange(accessLog?.timestamp, startDate, endDate)) {
          continue;
        }

        shareDownloads += 1;
        incrementBucket(dailyBuckets, accessLog.timestamp, "downloads", "day");
        incrementBucket(weeklyBuckets, accessLog.timestamp, "downloads", "week");
      }
    } else if (Number(share.downloadCount || 0) > 0 && isWithinRange(share.createdAt, startDate, endDate)) {
      shareDownloads += Number(share.downloadCount || 0);
      for (let index = 0; index < shareDownloads; index += 1) {
        incrementBucket(dailyBuckets, share.createdAt, "downloads", "day");
        incrementBucket(weeklyBuckets, share.createdAt, "downloads", "week");
      }
    }

    totalDownloads += shareDownloads;
    tenantReport._downloads += shareDownloads;
  }

  const tenantStats = [...tenantReports.values()].map((tenantReport) => {
    const storageUsagePercent = getUsagePercent(tenantReport.storageUsedBytes, tenantReport.storageLimitBytes);
    const activityScore = (tenantReport._uploads * 3) + (tenantReport._shares * 2) + tenantReport._downloads;

    return {
      tenantId: tenantReport.tenantId,
      tenantName: tenantReport.tenantName,
      usersCount: tenantReport.usersCount,
      filesCount: tenantReport.filesCount,
      storageUsedBytes: tenantReport.storageUsedBytes,
      storageLimitBytes: tenantReport.storageLimitBytes,
      storageUsagePercent,
      activityScore,
      lastActivity: tenantReport.lastActivity,
      suspicious: tenantReport.suspicious,
      blocked: tenantReport.blocked,
      quarantined: tenantReport.quarantined
    };
  });

  const securityTotals = tenantStats.reduce((totals, tenant) => {
    totals.blocked += tenant.blocked;
    totals.quarantined += tenant.quarantined;
    totals.suspicious += tenant.suspicious;
    return totals;
  }, { blocked: 0, quarantined: 0, suspicious: 0 });

  const usagePerTenant = [...tenantStats].sort((left, right) => (right.storageUsagePercent || 0) - (left.storageUsagePercent || 0));
  const topStorageConsumers = [...tenantStats].sort((left, right) => right.storageUsedBytes - left.storageUsedBytes);
  const tenantsNearQuota = usagePerTenant.filter((tenant) => (tenant.storageUsagePercent || 0) >= 80);
  const mostActiveTenants = [...tenantStats].sort((left, right) => {
    if (right.activityScore !== left.activityScore) {
      return right.activityScore - left.activityScore;
    }
    return right.filesCount - left.filesCount;
  });
  const mostSuspiciousTenants = [...tenantStats].sort((left, right) => {
    const rightScore = right.suspicious + right.blocked + right.quarantined;
    const leftScore = left.suspicious + left.blocked + left.quarantined;
    return rightScore - leftScore;
  });
  const highestStorageTenants = [...topStorageConsumers];

  const alerts = [];
  const threatCount = securityTotals.suspicious + securityTotals.blocked + securityTotals.quarantined;

  if (threatCount > 0) {
    alerts.push({
      type: "security",
      message: `${threatCount} fichier(s) requierent une verification de securite`,
      severity: threatCount >= 10 ? "high" : "medium"
    });
  }

  for (const tenant of tenantsNearQuota.slice(0, 3)) {
    alerts.push({
      type: "quota",
      tenantName: tenant.tenantName,
      message: `${tenant.tenantName} utilise ${Math.round(tenant.storageUsagePercent || 0)}% de son quota`,
      severity: (tenant.storageUsagePercent || 0) >= 90 ? "high" : "medium"
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      type: "health",
      message: "Aucune alerte prioritaire sur le perimetre selectionne",
      severity: "low"
    });
  }

  return {
    global: {
      totalTenants: matchedTenants.length,
      totalUsers: users.length,
      totalFiles: scopedFiles.length,
      totalStorageUsed: tenantStats.reduce((sum, tenant) => sum + tenant.storageUsedBytes, 0),
      totalStorageLimit,
      totalUploads,
      totalDownloads,
      totalShares
    },
    tenants: tenantStats,
    security: {
      totals: securityTotals,
      perTenant: tenantStats.map((tenant) => ({
        tenantId: tenant.tenantId,
        tenantName: tenant.tenantName,
        suspicious: tenant.suspicious,
        blocked: tenant.blocked,
        quarantined: tenant.quarantined
      }))
    },
    activity: {
      daily: toSortedSeries(dailyBuckets),
      weekly: toSortedSeries(weeklyBuckets),
      uploads: totalUploads,
      downloads: totalDownloads,
      shares: totalShares
    },
    storage: {
      usagePerTenant,
      topStorageConsumers,
      tenantsNearQuota
    },
    insights: {
      mostActiveTenants: mostActiveTenants.slice(0, 5),
      mostSuspiciousTenants: mostSuspiciousTenants.slice(0, 5),
      highestStorageTenants: highestStorageTenants.slice(0, 5)
    },
    alerts,
    meta: {
      activeUsers,
      verifiedUsers,
      adminUsers
    }
  };
};

export const adminManageQuarantinedFile = async (requester, fileId, action, options = {}) => {
  if (requester.role !== ROLES.SUPERADMIN && requester.role !== ROLES.TENANT_ADMIN) {
    throw new Error("Access denied: Admin privileges required");
  }

  const file = await File.findById(fileId).populate("ownerId", "firstName lastName email");
  if (!file) {
    throw new Error("File not found");
  }

  if (requester.role === ROLES.TENANT_ADMIN && String(file.tenantId) !== String(requester.tenantId)) {
    throw new Error("Access denied: File belongs to different tenant");
  }

  if (file.status !== "quarantined" && file.scanMetadata?.quarantineStatus !== "quarantined") {
    throw new Error("File is not quarantined");
  }

  file.scanMetadata = file.scanMetadata || {};
  const now = new Date();

  switch (action) {
    case "whitelist":
      file.status = "active";
      file.scanMetadata.quarantineStatus = "clean";
      file.scanMetadata.whitelistedBy = requester.userId || requester._id;
      file.scanMetadata.whitelistReason = options.reason || "Admin approved after investigation";
      file.scanMetadata.whitelistDate = now;
      file.scanMetadata.investigationNotes = options.notes || "";
      break;

    case "block":
      file.status = "blocked";
      file.scanMetadata.quarantineStatus = "quarantined";
      file.scanMetadata.investigationNotes = options.notes || "Admin blocked after investigation";
      break;

    case "investigate":
      file.scanMetadata.investigationNotes = options.notes || file.scanMetadata.investigationNotes || "";
      break;

    default:
      throw new Error("Invalid action. Use 'whitelist', 'block', or 'investigate'");
  }

  await file.save();

  await logAdminAction(requester, "quarantine_management", {
    fileId: file._id,
    fileName: file.originalName,
    action,
    reason: options.reason,
    notes: options.notes,
    tenantId: file.tenantId
  });

  return {
    fileId: file._id,
    action,
    newStatus: file.status,
    quarantineStatus: file.scanMetadata.quarantineStatus,
    updatedAt: file.updatedAt,
    investigator: `${requester.firstName || ""} ${requester.lastName || ""}`.trim(),
    investigationNotes: file.scanMetadata.investigationNotes
  };
};

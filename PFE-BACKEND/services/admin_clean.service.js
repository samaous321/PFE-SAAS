import mongoose from "mongoose";
import User from "../models/User.js";
import Tenant from "../models/Tenant.js";
import File from "../models/File.js";
import ShareHistory from "../models/ShareHistory.js";
import { getEffectiveQuotaPolicy } from "./quota.service.js";

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

const buildFileMatch = (filters, tenantIds) => {
  const match = {};
  if (tenantIds?.length) {
    match.tenantId = { $in: tenantIds };
  }

  const startDate = parseDate(filters.startDate);
  const endDate = normalizeEndDate(parseDate(filters.endDate));
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = startDate;
    if (endDate) match.createdAt.$lte = endDate;
  }

  if (filters.fileType) {
    match.mimeType = { $regex: filters.fileType, $options: "i" };
  }

  if (filters.status) {
    match.status = filters.status;
  }

  return match;
};

const buildShareMatch = (filters, tenantIds) => {
  const match = {};
  if (tenantIds?.length) {
    match["sharedBy.tenantId"] = { $in: tenantIds };
  }

  const startDate = parseDate(filters.startDate);
  const endDate = normalizeEndDate(parseDate(filters.endDate));
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = startDate;
    if (endDate) match.createdAt.$lte = endDate;
  }

  if (filters.fileType) {
    match.mimeType = { $regex: filters.fileType, $options: "i" };
  }

  return match;
};

const getWeekKey = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const year = d.getFullYear();
  const firstDayOfYear = new Date(year, 0, 1);
  const pastDaysOfYear = Math.floor((d - firstDayOfYear) / 86400000);
  const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  return `${year}-W${String(weekNumber).padStart(2, "0")}`;
};

const buildDateRange = (startDate, endDate) => {
  const values = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    values.push(formatDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return values;
};

const buildWeekRange = (startDate, endDate) => {
  const values = [];
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);
  while (cursor <= endDate) {
    values.push(getWeekKey(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return values;
};

const createTrendSeries = (keys, rows) => {
  const map = new Map((rows || []).map((row) => [row._id, Number(row.count || 0)]));
  return keys.map((key) => ({
    period: key,
    value: map.get(key) || 0
  }));
};

const buildTenantStats = (tenantDocs, fileRows, userCountsByTenant) => {
  const fileStatsByTenant = new Map(
    (fileRows || []).map((row) => [String(row.tenantId), row])
  );

  return tenantDocs.map((tenant) => {
    const tenantId = String(tenant._id);
    const fileStats = fileStatsByTenant.get(tenantId) || {};
    const quotaBytes = getEffectiveQuotaPolicy(tenant).tenant.storageBytes;
    const storageUsedBytes = Number(fileStats.storageUsedBytes || 0);
    return {
      tenantId,
      tenantName: tenant.name,
      usersCount: Number(userCountsByTenant.get(tenantId) || 0),
      filesCount: Number(fileStats.filesCount || 0),
      storageUsedBytes,
      storageLimitBytes: quotaBytes,
      storageUsagePercent:
        quotaBytes != null
          ? Math.min((storageUsedBytes / quotaBytes) * 100, 100)
          : null,
      activityScore: Number(fileStats.activityScore || 0),
      lastActivity: fileStats.lastActivity ? fileStats.lastActivity.toISOString() : null,
      suspicious: Number(fileStats.suspicious || 0),
      blocked: Number(fileStats.blocked || 0),
      quarantined: Number(fileStats.quarantined || 0)
    };
  });
};

const buildAlerts = (tenantStats, uploadTrend) => {
  const alerts = [];
  const dailyCounts = uploadTrend.map((item) => item.value);
  const dailyAverage = dailyCounts.length
    ? dailyCounts.reduce((sum, value) => sum + value, 0) / dailyCounts.length
    : 0;

  const spikeThreshold = Math.max(dailyAverage * 2, 10);
  uploadTrend.forEach((item) => {
    if (item.value >= spikeThreshold && item.value > 0) {
      alerts.push({
        type: "high_activity_spike",
        message: `High upload activity on ${item.period}: ${item.value} uploads`,
        tenantName: null,
        severity: "medium"
      });
    }
  });

  tenantStats.forEach((tenant) => {
    if (tenant.storageUsagePercent !== null && tenant.storageUsagePercent >= 80) {
      alerts.push({
        type: "storage_near_limit",
        message: `${tenant.tenantName} is using ${tenant.storageUsagePercent.toFixed(1)}% of quota`,
        tenantName: tenant.tenantName,
        severity: tenant.storageUsagePercent >= 90 ? "high" : "medium"
      });
    }

    if (tenant.blocked > 0 || tenant.quarantined > 0 || tenant.suspicious > 0) {
      alerts.push({
        type: "security_risk",
        message: `${tenant.tenantName} has ${tenant.blocked} blocked, ${tenant.quarantined} quarantined, ${tenant.suspicious} suspicious files`,
        tenantName: tenant.tenantName,
        severity: tenant.blocked > 0 ? "high" : "medium"
      });
    }
  });

  return alerts;
};

export const getDashboardStats = async (requester) => {
  // SECURITY: TENANT_ADMIN can only view their own tenant's stats
  if (!requester) {
    throw new Error("Invalid requester context");
  }

  const { ROLES } = await import("../constants/roles.js");
  const isSuperAdmin = requester?.role === ROLES.SUPERADMIN;
  const isTenantAdmin = requester?.role === ROLES.TENANT_ADMIN;

  if (!isSuperAdmin && !isTenantAdmin) {
    throw new Error("Not authorized");
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  // Build tenant filter
  const tenantFilter = isSuperAdmin ? {} : { _id: requester.tenantId };
  const tenantIdFilter = isSuperAdmin ? {} : { tenantId: requester.tenantId };

  const [
    totalUsers,
    totalTenants,
    totalFiles,
    activeUsers,
    recentUsers,
    recentTenants,
    fileSummary,
    infectedCount,
    uploadsByDayRows,
    storageByTenantRows,
    tenants
  ] = await Promise.all([
    User.countDocuments(isSuperAdmin ? {} : { tenantId: requester.tenantId }),
    Tenant.countDocuments(tenantFilter),
    File.countDocuments(tenantIdFilter),
    User.countDocuments(isSuperAdmin ? { status: "active" } : { status: "active", tenantId: requester.tenantId }),
    User.find(isSuperAdmin ? {} : { tenantId: requester.tenantId }).sort({ createdAt: -1 }).limit(10),
    Tenant.find(tenantFilter).sort({ createdAt: -1 }).limit(10),
    File.aggregate([
      {
        $match: tenantIdFilter
      },
      {
        $group: {
          _id: null,
          totalStorageUsed: { $sum: { $ifNull: ["$size", 0] } }
        }
      }
    ]),
    File.countDocuments({
      ...tenantIdFilter,
      $or: [
        { status: "blocked" },
        { "scanMetadata.clamavResult.isInfected": true },
        {
          "scanMetadata.quarantineStatus": {
            $in: ["quarantined"]
          }
        }
      ]
    }),
    File.aggregate([
      {
        $match: {
          ...tenantIdFilter,
          createdAt: {
            $gte: sevenDaysAgo,
            $lte: now
          }
        }
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt"
              }
            }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id.date": -1 } }
    ]),
    File.aggregate([
      {
        $match: tenantIdFilter
      },
      {
        $group: {
          _id: "$tenantId",
          used: { $sum: { $ifNull: ["$size", 0] } }
        }
      },
      {
        $lookup: {
          from: "tenants",
          localField: "_id",
          foreignField: "_id",
          as: "tenant"
        }
      },
      {
        $project: {
          _id: 0,
          tenantId: "$_id",
          used: 1,
          name: {
            $ifNull: [{ $arrayElemAt: ["$tenant.name", 0] }, "Tenant"]
          },
          limit: {
            $ifNull: [{ $arrayElemAt: ["$tenant.storageLimit", 0] }, 0]
          }
        }
      },
      { $sort: { used: -1 } }
    ]),
    Tenant.find(tenantFilter).select("name")  
  ]);

  const uploadsMap = new Map(
    uploadsByDayRows.map((row) => [String(row?._id?.date), Number(row?.count || 0)])
  );

  const uploadsByDay = [];
  for (let i = 0; i < 7; i += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    const dateKey = formatDateKey(date);
    uploadsByDay.push({
      date: dateKey,
      count: uploadsMap.get(dateKey) || 0
    });
  }

  const tenantLimitMap = new Map(
    tenants.map((tenant) => [String(tenant._id), Number(tenant.storageLimit || 0)])
  );

  const storageByTenant = storageByTenantRows.map((row) => {
    const tenantId = String(row.tenantId || "");
    return {
      tenantId,
      name: row.name || "Tenant",
      used: Number(row.used || 0),
      limit: tenantLimitMap.get(tenantId) || Number(row.limit || 0)
    };
  });

  const totalStorageLimit = Array.from(tenantLimitMap.values()).reduce(
    (sum, value) => sum + Number(value || 0),
    0
  );

  return {
    totalUsers,
    totalTenants,
    totalFiles,
    totalStorageUsed: Number(fileSummary?.[0]?.totalStorageUsed || 0),
    totalStorageLimit,
    activeUsers,
    recentUsers,
    recentTenants,
    malwareDetected: infectedCount,
    uploadsByDay,
    storageByTenant
  };
};

export const getAdminStatsReport = async (requester, filters = {}) => {
  // SECURITY: Validate requester and restrict access
  if (!requester) {
    throw new Error("Invalid requester context");
  }

  const { ROLES } = await import("../constants/roles.js");
  const isSuperAdmin = requester?.role === ROLES.SUPERADMIN;
  const isTenantAdmin = requester?.role === ROLES.TENANT_ADMIN;

  if (!isSuperAdmin && !isTenantAdmin) {
    throw new Error("Not authorized");
  }

  // SECURITY: TENANT_ADMIN cannot override tenantId filter
  if (isTenantAdmin && !requester?.tenantId) {
    throw new Error("Invalid tenant context");
  }

  const tenantId = filters.tenantId?.trim();
  const tenantName = filters.tenantName?.trim();
  const tenantsQuery = {};

  // SECURITY: Override tenantId if TENANT_ADMIN
  if (isTenantAdmin) {
    tenantsQuery._id = requester.tenantId;
  } else if (tenantId) {
    if (mongoose.Types.ObjectId.isValid(tenantId)) {
      tenantsQuery._id = mongoose.Types.ObjectId(tenantId);
    } else {
      return {
        global: {
          totalTenants: 0,
          totalUsers: 0,
          totalFiles: 0,
          totalStorageUsed: 0,
          totalUploads: 0,
          totalDownloads: 0,
          totalShares: 0
        },
        tenants: [],
        security: {
          totals: { blocked: 0, suspicious: 0, quarantined: 0 },
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
      };
    }
  } else if (tenantName) {
    tenantsQuery.name = { $regex: tenantName, $options: "i" };
  }

  const matchedTenants = await Tenant.find(tenantsQuery).lean();
  if ((tenantId || tenantName) && matchedTenants.length === 0) {
    return {
      global: {
        totalTenants: 0,
        totalUsers: 0,
        totalFiles: 0,
        totalStorageUsed: 0,
        totalUploads: 0,
        totalDownloads: 0,
        totalShares: 0
      },
      tenants: [],
      security: {
        totals: { blocked: 0, suspicious: 0, quarantined: 0 },
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
    };
  }

  const tenantIds = matchedTenants.length
    ? matchedTenants.map((tenant) => tenant._id)
    : [];

  const fileMatch = buildFileMatch(filters, tenantIds);
  const shareMatch = buildShareMatch(filters, tenantIds);

  const now = new Date();
  const dailyStart = parseDate(filters.startDate)
    ? new Date(parseDate(filters.startDate))
    : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
  dailyStart.setHours(0, 0, 0, 0);
  const dailyEnd = normalizeEndDate(parseDate(filters.endDate)) || new Date(now);

  const weeklyStart = new Date(dailyStart);
  weeklyStart.setDate(weeklyStart.getDate() - 7 * 11);
  weeklyStart.setHours(0, 0, 0, 0);

  const [totalTenants, totalUsers, usersByTenant, tenantDocs, fileFacet, shareFacet] = await Promise.all([
    Tenant.countDocuments(tenantIds.length ? { _id: { $in: tenantIds } } : {}),
    User.countDocuments(tenantIds.length ? { tenantId: { $in: tenantIds } } : {}),
    User.aggregate([
      ...(tenantIds.length ? [{ $match: { tenantId: { $in: tenantIds } } }] : []),
      { $group: { _id: "$tenantId", usersCount: { $sum: 1 } } }
    ]),
    Tenant.find(tenantIds.length ? { _id: { $in: tenantIds } } : {}).lean(),
    File.aggregate([
      { $match: fileMatch },
      {
        $facet: {
          global: [
            {
              $group: {
                _id: null,
                totalFiles: { $sum: 1 },
                totalStorageUsed: { $sum: { $ifNull: ["$size", 0] } },
                totalDownloads: { $sum: { $ifNull: ["$downloadCount", 0] } }
              }
            }
          ],
          perTenant: [
            {
              $group: {
                _id: "$tenantId",
                filesCount: { $sum: 1 },
                storageUsedBytes: { $sum: { $ifNull: ["$size", 0] } },
                uploads: { $sum: 1 },
                downloads: { $sum: { $ifNull: ["$downloadCount", 0] } },
                blocked: {
                  $sum: {
                    $cond: [{ $eq: ["$status", "blocked"] }, 1, 0]
                  }
                },
                quarantined: {
                  $sum: {
                    $cond: [
                      { $eq: ["$scanMetadata.quarantineStatus", "quarantined"] },
                      1,
                      0
                    ]
                  }
                },
                suspicious: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $ne: ["$scanStatus", "clean"] },
                          { $ne: ["$scanStatus", "pending"] },
                          { $ne: ["$scanMetadata.quarantineStatus", "clean"] }
                        ]
                      },
                      1,
                      0
                    ]
                  }
                },
                lastActivity: { $max: { $ifNull: ["$updatedAt", "$createdAt"] } }
              }
            },
            {
              $lookup: {
                from: "tenants",
                localField: "_id",
                foreignField: "_id",
                as: "tenant"
              }
            },
            {
              $unwind: {
                path: "$tenant",
                preserveNullAndEmptyArrays: true
              }
            },
            {
              $project: {
                tenantId: "$_id",
                filesCount: 1,
                storageUsedBytes: 1,
                activityScore: { $add: ["$uploads", "$downloads"] },
                blocked: 1,
                quarantined: 1,
                suspicious: 1,
                lastActivity: 1,
                tenant: 1
              }
            }
          ],
          uploadsByDay: [
            {
              $match: {
                createdAt: { $gte: dailyStart, $lte: dailyEnd }
              }
            },
            {
              $group: {
                _id: {
                  $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
                },
                count: { $sum: 1 }
              }
            },
            { $sort: { _id: 1 } }
          ]
        }
      }
    ]),
    ShareHistory.aggregate([
      { $match: shareMatch },
      {
        $facet: {
          global: [
            {
              $group: {
                _id: null,
                totalShares: { $sum: 1 },
                totalShareDownloads: { $sum: { $ifNull: ["$downloadCount", 0] } }
              }
            }
          ],
          sharesByTenant: [
            {
              $group: {
                _id: "$sharedBy.tenantId",
                shares: { $sum: 1 },
                downloads: { $sum: { $ifNull: ["$downloadCount", 0] } },
                views: { $sum: { $ifNull: ["$viewCount", 0] } },
                lastShareActivity: { $max: { $ifNull: ["$lastAccessedAt", "$createdAt"] } }
              }
            }
          ],
          sharesByDay: [
            {
              $group: {
                _id: {
                  $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
                },
                count: { $sum: 1 }
              }
            },
            { $sort: { _id: 1 } }
          ],
          downloadEvents: [
            { $unwind: "$accessLogs" },
            {
              $match: {
                "accessLogs.action": "download",
                "accessLogs.timestamp": { $gte: dailyStart, $lte: dailyEnd }
              }
            },
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: "%Y-%m-%d",
                    date: "$accessLogs.timestamp"
                  }
                },
                count: { $sum: 1 }
              }
            },
            { $sort: { _id: 1 } }
          ],
        }
      }
    ])
  ]);

  const globalFileData = fileFacet?.[0]?.global?.[0] || {};
  const globalShareData = shareFacet?.[0]?.global?.[0] || {};

  const userCountMap = new Map((usersByTenant || []).map((item) => [String(item._id), item.usersCount]));
  const tenantStats = buildTenantStats(tenantDocs, fileFacet?.[0]?.perTenant, userCountMap);

  const uploadsMap = new Map((fileFacet?.[0]?.uploadsByDay || []).map((row) => [row._id, Number(row.count || 0)]));
  const sharesMap = new Map((shareFacet?.[0]?.sharesByDay || []).map((row) => [row._id, Number(row.count || 0)]));
  const downloadsMap = new Map((shareFacet?.[0]?.downloadEvents || []).map((row) => [row._id, Number(row.count || 0)]));

  const dailyKeys = buildDateRange(dailyStart, dailyEnd);
  const weeklyKeys = buildWeekRange(weeklyStart, dailyEnd);

  const dailyTrend = dailyKeys.map((key) => ({
    period: key,
    uploads: uploadsMap.get(key) || 0,
    shares: sharesMap.get(key) || 0,
    downloads: downloadsMap.get(key) || 0
  }));

  const weeklyTrend = weeklyKeys.map((key) => {
    const values = dailyTrend.filter((entry) => getWeekKey(new Date(entry.period)) === key);
    return {
      period: key,
      uploads: values.reduce((sum, entry) => sum + entry.uploads, 0),
      shares: values.reduce((sum, entry) => sum + entry.shares, 0),
      downloads: values.reduce((sum, entry) => sum + entry.downloads, 0)
    };
  });

  const sortedByStorage = [...tenantStats].sort(
    (a, b) => b.storageUsedBytes - a.storageUsedBytes
  );
  const sortedByActivity = [...tenantStats].sort(
    (a, b) => b.activityScore - a.activityScore
  );
  const sortedBySecurity = [...tenantStats].sort(
    (a, b) =>
      (b.suspicious || 0) + (b.quarantined || 0) + (b.blocked || 0) -
      ((a.suspicious || 0) + (a.quarantined || 0) + (a.blocked || 0))
  );

  const securityTotals = tenantStats.reduce(
    (acc, tenant) => {
      acc.blocked += tenant.blocked || 0;
      acc.suspicious += tenant.suspicious || 0;
      acc.quarantined += tenant.quarantined || 0;
      return acc;
    },
    { blocked: 0, suspicious: 0, quarantined: 0 }
  );

  const storageNearQuota = tenantStats.filter(
    (tenant) => tenant.storageUsagePercent !== null && tenant.storageUsagePercent >= 80
  );

  const alerts = buildAlerts(tenantStats, dailyTrend);

  return {
    global: {
      totalTenants,
      totalUsers,
      totalFiles: Number(globalFileData.totalFiles || 0),
      totalStorageUsed: Number(globalFileData.totalStorageUsed || 0),
      totalUploads: Number(globalFileData.totalFiles || 0),
      totalDownloads: Number(globalFileData.totalDownloads || 0),
      totalShares: Number(globalShareData.totalShares || 0)
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
      daily: dailyTrend,
      weekly: weeklyTrend,
      uploads: Number(globalFileData.totalFiles || 0),
      downloads: Number(globalFileData.totalDownloads || 0),
      shares: Number(globalShareData.totalShares || 0)
    },
    storage: {
      usagePerTenant: tenantStats,
      topStorageConsumers: sortedByStorage.slice(0, 10),
      tenantsNearQuota: storageNearQuota.sort(
        (a, b) => (b.storageUsagePercent || 0) - (a.storageUsagePercent || 0)
      )
    },
    insights: {
      mostActiveTenants: sortedByActivity.slice(0, 10),
      mostSuspiciousTenants: sortedBySecurity.slice(0, 10),
      highestStorageTenants: sortedByStorage.slice(0, 10)
    },
    alerts
  };
};

 
 
 / * * 
   *   P H A S E   2 :   A d m i n   m a n a g e m e n t   o f   q u a r a n t i n e d   f i l e s 

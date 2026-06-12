import mongoose from "mongoose";
import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
import File from "../models/File.js";
import Plan from "../models/Plan.js";
import Folder from "../models/Folder.js";
import { getEffectiveQuotaPolicy, recordQuotaEvent } from "./quota.service.js";

const QUOTA_WARNING_THRESHOLD = 80;
const QUOTA_CRITICAL_THRESHOLD = 90;
const QUOTA_FULL_THRESHOLD = 100;

const getUsagePercent = (used, limit) => {
  if (!limit || limit <= 0) {
    return null;
  }

  return Math.min((Number(used || 0) / limit) * 100, 100);
};

const getQuotaSeverity = (percent) => {
  if (percent === null || percent === undefined) return null;
  if (percent >= QUOTA_FULL_THRESHOLD) return "full";
  if (percent >= QUOTA_CRITICAL_THRESHOLD) return "critical";
  if (percent >= QUOTA_WARNING_THRESHOLD) return "warning";
  return null;
};

const buildQuotaAlert = ({ key, label, used, limit }) => {
  const percent = getUsagePercent(used, limit);
  const severity = getQuotaSeverity(percent);

  if (!severity) {
    return null;
  }

  return {
    type: "quota",
    key,
    label,
    severity,
    used,
    limit,
    percent: Math.round(percent),
    threshold: severity === "full"
      ? QUOTA_FULL_THRESHOLD
      : severity === "critical"
        ? QUOTA_CRITICAL_THRESHOLD
        : QUOTA_WARNING_THRESHOLD
  };
};

const getQuotaStatus = (alerts = []) => {
  if (alerts.some((alert) => alert.severity === "full")) return "full";
  if (alerts.some((alert) => alert.severity === "critical")) return "critical";
  if (alerts.some((alert) => alert.severity === "warning")) return "warning";
  return "healthy";
};

const getTenantUsageSnapshot = async (tenantId) => {
  const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
  const [storageSummary, usersCount, activeUsersCount, filesCount, foldersCount, blockedFilesCount] = await Promise.all([
    File.aggregate([
      { $match: { tenantId: tenantObjectId } },
      {
        $group: {
          _id: null,
          totalStorageUsed: { $sum: { $ifNull: ["$size", 0] } },
          totalDownloads: { $sum: { $ifNull: ["$downloadCount", 0] } }
        }
      }
    ]),
    User.countDocuments({ tenantId: tenantObjectId }),
    User.countDocuments({ tenantId: tenantObjectId, status: "active" }),
    File.countDocuments({ tenantId: tenantObjectId }),
    Folder.countDocuments({ tenantId: tenantObjectId }),
    File.countDocuments({ tenantId: tenantObjectId, status: "blocked" })
  ]);

  return {
    storageUsed: storageSummary?.[0]?.totalStorageUsed || 0,
    totalDownloads: storageSummary?.[0]?.totalDownloads || 0,
    usersCount,
    activeUsersCount,
    filesCount,
    foldersCount,
    blockedFilesCount
  };
};

const appendQuotaStats = (tenant, usage) => {
  const plainTenant = typeof tenant.toObject === "function" ? tenant.toObject() : { ...tenant };
  const quotaPolicy = getEffectiveQuotaPolicy(plainTenant);
  const quotaAlerts = [
    buildQuotaAlert({
      key: "tenant.storage",
      label: "Stockage tenant",
      used: usage.storageUsed,
      limit: quotaPolicy.tenant.storageBytes
    }),
    buildQuotaAlert({
      key: "tenant.users",
      label: "Utilisateurs",
      used: usage.usersCount,
      limit: quotaPolicy.tenant.maxUsers
    }),
    buildQuotaAlert({
      key: "tenant.files",
      label: "Fichiers",
      used: usage.filesCount,
      limit: quotaPolicy.tenant.maxFiles
    }),
    buildQuotaAlert({
      key: "tenant.folders",
      label: "Dossiers",
      used: usage.foldersCount,
      limit: quotaPolicy.tenant.maxFolders
    })
  ].filter(Boolean);

  return {
    ...plainTenant,
    subscriptionPlan: quotaPolicy.plan,
    usersCount: usage.usersCount,
    activeUsersCount: usage.activeUsersCount,
    filesCount: usage.filesCount,
    foldersCount: usage.foldersCount,
    blockedFilesCount: usage.blockedFilesCount,
    storageUsed: usage.storageUsed,
    totalDownloads: usage.totalDownloads,
    storageLimit: quotaPolicy.tenant.storageBytes,
    storageUsedPercent: getUsagePercent(usage.storageUsed, quotaPolicy.tenant.storageBytes),
    maxUsers: quotaPolicy.tenant.maxUsers,
    maxFiles: quotaPolicy.tenant.maxFiles,
    maxFolders: quotaPolicy.tenant.maxFolders,
    userStorageLimit: quotaPolicy.user.storageBytes,
    userMaxFiles: quotaPolicy.user.maxFiles,
    userDailyUploadLimit: quotaPolicy.user.maxDailyUploadBytes,
    quotaStatus: getQuotaStatus(quotaAlerts),
    quotaAlerts
  };
};

const getMonthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const getMonthLabel = (date) => new Intl.DateTimeFormat("fr-FR", {
  month: "short",
  year: "numeric"
}).format(date);

const buildMonthlyUsageSeries = (monthlyStats = []) => {
  const now = new Date();
  const series = [];

  for (let offset = 11; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    series.push({
      key: getMonthKey(date),
      label: getMonthLabel(date),
      storageUsedBytes: 0,
      filesCount: 0
    });
  }

  const index = new Map(series.map((entry) => [entry.key, entry]));
  for (const row of monthlyStats) {
    const rowKey = `${row._id.year}-${String(row._id.month).padStart(2, "0")}`;
    const bucket = index.get(rowKey);
    if (!bucket) {
      continue;
    }

    bucket.storageUsedBytes = Number(row.storageUsedBytes || 0);
    bucket.filesCount = Number(row.filesCount || 0);
  }

  return series;
};

const padNumber = (value) => String(value).padStart(2, "0");

const getWeekNumber = (date) => {
  const copied = new Date(date.getTime());
  copied.setHours(0, 0, 0, 0);
  copied.setDate(copied.getDate() + 4 - (copied.getDay() || 7));
  const yearStart = new Date(copied.getFullYear(), 0, 1);
  const weekNumber = Math.ceil((((copied - yearStart) / 86400000) + 1) / 7);
  return weekNumber;
};

const getRangeLabel = (range) => {
  switch (range) {
    case "7d":
      return "Derniers 7 jours";
    case "30d":
      return "Derniers 30 jours";
    case "90d":
      return "Derniers 90 jours";
    default:
      return "12 derniers mois";
  }
};

const buildTimeSeries = (range = "1y", stats = []) => {
  const now = new Date();
  let buckets = [];
  let index = new Map();

  if (range === "7d" || range === "30d") {
    const days = range === "7d" ? 7 : 30;
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
      const key = `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
      buckets.push({
        key,
        label: `${padNumber(date.getDate())}/${padNumber(date.getMonth() + 1)}`,
        storageUsedBytes: 0,
        filesCount: 0
      });
    }

    index = new Map(buckets.map((entry) => [entry.key, entry]));
    for (const row of stats) {
      const rowKey = `${row._id.year}-${padNumber(row._id.month)}-${padNumber(row._id.day)}`;
      const bucket = index.get(rowKey);
      if (bucket) {
        bucket.storageUsedBytes = Number(row.storageUsedBytes || 0);
        bucket.filesCount = Number(row.filesCount || 0);
      }
    }
  } else if (range === "90d") {
    for (let offset = 12; offset >= 0; offset -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset * 7);
      const weekNumber = getWeekNumber(date);
      const key = `${date.getFullYear()}-W${padNumber(weekNumber)}`;
      buckets.push({
        key,
        label: `S${weekNumber}`,
        storageUsedBytes: 0,
        filesCount: 0
      });
    }

    index = new Map(buckets.map((entry) => [entry.key, entry]));
    for (const row of stats) {
      const rowKey = `${row._id.year}-W${padNumber(row._id.week)}`;
      const bucket = index.get(rowKey);
      if (bucket) {
        bucket.storageUsedBytes = Number(row.storageUsedBytes || 0);
        bucket.filesCount = Number(row.filesCount || 0);
      }
    }
  } else {
    buckets = buildMonthlyUsageSeries(stats);
  }

  return buckets;
};

const buildActivitySummary = async (tenantId, range = "30d") => {
  const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
  const now = new Date();
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));

  const [recentStats, lastUploadDate] = await Promise.all([
    File.aggregate([
      {
        $match: {
          tenantId: tenantObjectId,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          totalStorage: { $sum: { $ifNull: ["$size", 0] } },
          fileCount: { $sum: 1 }
        }
      }
    ]),
    File.find({ tenantId: tenantObjectId })
      .sort({ createdAt: -1 })
      .limit(1)
      .select("createdAt")
      .lean()
  ]);

  const stats = recentStats[0] || { totalStorage: 0, fileCount: 0 };
  return {
    averageDailyUploadBytes: days > 0 ? Math.round((stats.totalStorage || 0) / days) : 0,
    averageFileSizeBytes: stats.fileCount > 0 ? Math.round((stats.totalStorage || 0) / stats.fileCount) : 0,
    recentFilesUploaded: stats.fileCount || 0,
    lastUploadDate: lastUploadDate?.[0]?.createdAt || null
  };
};

const buildUserConsumption = (users = [], usageMap = new Map(), quotaPolicy) => {
  const activeUserLimit = quotaPolicy?.user?.storageBytes ?? null;

  return users
    .map((user) => {
      const usage = usageMap.get(String(user._id)) || {};
      const storageUsedBytes = Number(usage.storageUsedBytes || 0);
      const filesCount = Number(usage.filesCount || 0);
      const storageUsedPercent = activeUserLimit
        ? Math.min((storageUsedBytes / activeUserLimit) * 100, 100)
        : null;

      return {
        userId: String(user._id),
        name: [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email || "Utilisateur",
        email: user.email,
        role: user.role,
        status: user.status,
        storageUsedBytes,
        storageLimitBytes: activeUserLimit,
        storageUsedPercent,
        remainingStorageBytes: activeUserLimit !== null ? Math.max(activeUserLimit - storageUsedBytes, 0) : null,
        filesCount
      };
    })
    .sort((left, right) => right.storageUsedBytes - left.storageUsedBytes);
};

const buildSaturationForecast = (usage, quotaLimitBytes, monthlyUsageSeries = []) => {
  if (!quotaLimitBytes) {
    return {
      averageMonthlyGrowthBytes: 0,
      averageMonthlyGrowthLabel: "Illimité",
      monthsRemaining: null,
      estimatedFullDate: null,
      trend: "stable",
      remainingStorageBytes: null
    };
  }

  const recentUsage = monthlyUsageSeries.slice(-6).map((month) => Number(month.storageUsedBytes || 0));
  const averageMonthlyGrowthBytes = recentUsage.length > 0
    ? recentUsage.reduce((sum, value) => sum + value, 0) / recentUsage.length
    : 0;
  const remainingStorageBytes = Math.max(quotaLimitBytes - usage, 0);
  const monthsRemaining = averageMonthlyGrowthBytes > 0
    ? remainingStorageBytes / averageMonthlyGrowthBytes
    : null;

  let estimatedFullDate = null;
  if (monthsRemaining !== null) {
    const predictedDate = new Date();
    predictedDate.setMonth(predictedDate.getMonth() + Math.ceil(monthsRemaining));
    estimatedFullDate = predictedDate.toISOString();
  }

  const trend = averageMonthlyGrowthBytes > 0
    ? "rising"
    : averageMonthlyGrowthBytes < 0
      ? "declining"
      : "stable";

  return {
    averageMonthlyGrowthBytes,
    averageMonthlyGrowthLabel: `${Math.round(averageMonthlyGrowthBytes / (1024 * 1024))} MB / mois`,
    monthsRemaining: monthsRemaining !== null ? Number(monthsRemaining.toFixed(1)) : null,
    estimatedFullDate,
    trend,
    remainingStorageBytes
  };
};

const enrichTenantsWithQuotaStats = async (tenants = []) => {
  if (!tenants.length) {
    return [];
  }

  const tenantIds = tenants.map((tenant) => tenant._id);
  const [fileStats, userStats, folderStats] = await Promise.all([
    File.aggregate([
      { $match: { tenantId: { $in: tenantIds } } },
      {
        $group: {
          _id: "$tenantId",
          storageUsed: { $sum: { $ifNull: ["$size", 0] } },
          filesCount: { $sum: 1 },
          totalDownloads: { $sum: { $ifNull: ["$downloadCount", 0] } },
          blockedFilesCount: {
            $sum: {
              $cond: [{ $eq: ["$status", "blocked"] }, 1, 0]
            }
          }
        }
      }
    ]),
    User.aggregate([
      { $match: { tenantId: { $in: tenantIds } } },
      {
        $group: {
          _id: "$tenantId",
          usersCount: { $sum: 1 },
          activeUsersCount: {
            $sum: {
              $cond: [{ $eq: ["$status", "active"] }, 1, 0]
            }
          }
        }
      }
    ]),
    Folder.aggregate([
      { $match: { tenantId: { $in: tenantIds } } },
      { $group: { _id: "$tenantId", foldersCount: { $sum: 1 } } }
    ])
  ]);

  const fileStatsMap = new Map(fileStats.map((entry) => [String(entry._id), entry]));
  const userStatsMap = new Map(userStats.map((entry) => [String(entry._id), entry]));
  const folderStatsMap = new Map(folderStats.map((entry) => [String(entry._id), entry]));

  return tenants.map((tenant) => {
    const tenantId = String(tenant._id);
    const files = fileStatsMap.get(tenantId) || {};
    const users = userStatsMap.get(tenantId) || {};
    const folders = folderStatsMap.get(tenantId) || {};

    return appendQuotaStats(tenant, {
      storageUsed: files.storageUsed || 0,
      totalDownloads: files.totalDownloads || 0,
      filesCount: files.filesCount || 0,
      blockedFilesCount: files.blockedFilesCount || 0,
      usersCount: users.usersCount || 0,
      activeUsersCount: users.activeUsersCount || 0,
      foldersCount: folders.foldersCount || 0
    });
  });
};

const assertQuotaConfigCanApply = (usage, policy) => {
  const checks = [
    { label: "storage", used: usage.storageUsed, limit: policy.tenant.storageBytes },
    { label: "users", used: usage.usersCount, limit: policy.tenant.maxUsers },
    { label: "files", used: usage.filesCount, limit: policy.tenant.maxFiles },
    { label: "folders", used: usage.foldersCount, limit: policy.tenant.maxFolders }
  ];

  const invalid = checks.find((check) => check.limit !== null && check.limit !== undefined && check.limit > 0 && check.used > check.limit);
  if (invalid) {
    throw new Error(`Quota ${invalid.label} is below current usage (${invalid.used}/${invalid.limit})`);
  }
};

// Check if tenant domain exists
export const tenantDomainExists = async (domain) => {
  if (!domain) return false;
  const tenant = await Tenant.findOne({ domain: domain.toLowerCase() });
  return !!tenant;
};

// CREATE
export const createTenant = async (data) => {
  // Vérifier si domain existe déjà
  const existing = await Tenant.findOne({ domain: data.domain });
  if (existing) {
    throw new Error("Tenant domain already exists");
  }

  if (data.subscriptionPlan) {
    const planExists = await Plan.exists({ slug: String(data.subscriptionPlan).toLowerCase() });
    if (!planExists) {
      throw new Error("Invalid subscription plan");
    }
  }

  const tenant = await Tenant.create(data);
  return tenant;
};

// GET ALL
export const getAllTenants = async () => {
  const tenants = await Tenant.find().sort({ createdAt: -1 });
  return enrichTenantsWithQuotaStats(tenants);
};

export const getAllTenantsPaginated = async (options = {}) => {
  const page = Math.max(Number(options.page) || 1, 1);
  const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Tenant.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
    Tenant.countDocuments({})
  ]);

  return {
    items: await enrichTenantsWithQuotaStats(items),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
};

// GET BY ID
export const getTenantById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Invalid Tenant ID");
  }

  const tenant = await Tenant.findById(id);

  if (!tenant) {
    throw new Error("Tenant not found");
  }

  return tenant;
};

export const getTenantStats = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Invalid Tenant ID");
  }

  const tenant = await Tenant.findById(id);
  if (!tenant) {
    throw new Error("Tenant not found");
  }

  const quotaPolicy = getEffectiveQuotaPolicy(tenant);

  const usage = await getTenantUsageSnapshot(id);

  return {
    tenantId: tenant._id,
    tenantName: tenant.name,
    tenantStatus: tenant.status,
    subscriptionPlan: tenant.subscriptionPlan,
    usersCount: usage.usersCount,
    activeUsersCount: usage.activeUsersCount,
    filesCount: usage.filesCount,
    foldersCount: usage.foldersCount,
    blockedFilesCount: usage.blockedFilesCount,
    storageUsed: usage.storageUsed,
    totalDownloads: usage.totalDownloads,
    storageLimit: quotaPolicy.tenant.storageBytes,
    storageUsedPercent: getUsagePercent(usage.storageUsed, quotaPolicy.tenant.storageBytes),
    maxUsers: quotaPolicy.tenant.maxUsers,
    maxFiles: quotaPolicy.tenant.maxFiles,
    maxFolders: quotaPolicy.tenant.maxFolders,
    generatedAt: new Date().toISOString()
  };
};

export const getTenantQuota = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Invalid Tenant ID");
  }

  const tenant = await Tenant.findById(id);
  if (!tenant) {
    throw new Error("Tenant not found");
  }

  const quotaPolicy = getEffectiveQuotaPolicy(tenant);
  const tenantObjectId = new mongoose.Types.ObjectId(id);

  const usage = await getTenantUsageSnapshot(tenantObjectId);
  const quotaAlerts = appendQuotaStats(tenant, usage).quotaAlerts;

  return {
    tenantId: tenant._id,
    tenantName: tenant.name,
    tenantStatus: tenant.status,
    subscriptionPlan: quotaPolicy.plan,
    storageUsed: usage.storageUsed,
    storageLimit: quotaPolicy.tenant.storageBytes,
    storageUsedPercent: getUsagePercent(usage.storageUsed, quotaPolicy.tenant.storageBytes),
    usersCount: usage.usersCount,
    maxUsers: quotaPolicy.tenant.maxUsers,
    filesCount: usage.filesCount,
    maxFiles: quotaPolicy.tenant.maxFiles,
    foldersCount: usage.foldersCount,
    maxFolders: quotaPolicy.tenant.maxFolders,
    userStorageLimit: quotaPolicy.user.storageBytes,
    userMaxFiles: quotaPolicy.user.maxFiles,
    userDailyUploadLimit: quotaPolicy.user.maxDailyUploadBytes,
    quotaAlerts,
    quotaStatus: getQuotaStatus(quotaAlerts),
    generatedAt: new Date().toISOString()
  };
};

export const getTenantDetailedStats = async (id, options = {}) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Invalid Tenant ID");
  }

  const tenant = await Tenant.findById(id);
  if (!tenant) {
    throw new Error("Tenant not found");
  }

  const range = String(options.range || "1y");
  const quota = await getTenantQuota(id);
  const tenantObjectId = new mongoose.Types.ObjectId(id);
  const now = new Date();
  let startDate = new Date(now.getTime());

  if (range === "7d") {
    startDate.setDate(now.getDate() - 6);
  } else if (range === "30d") {
    startDate.setDate(now.getDate() - 29);
  } else if (range === "90d") {
    startDate.setDate(now.getDate() - 89);
  } else {
    startDate.setMonth(now.getMonth() - 11);
    startDate.setDate(1);
  }

  startDate.setHours(0, 0, 0, 0);

  const timeBucket = range === "7d" || range === "30d"
    ? { year: { $year: "$createdAt" }, month: { $month: "$createdAt" }, day: { $dayOfMonth: "$createdAt" } }
    : range === "90d"
      ? { year: { $year: "$createdAt" }, week: { $isoWeek: "$createdAt" } }
      : { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } };

  const timeGroupPipeline = [
    {
      $match: {
        tenantId: tenantObjectId,
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: timeBucket,
        storageUsedBytes: { $sum: { $ifNull: ["$size", 0] } },
        filesCount: { $sum: 1 }
      }
    },
    { $sort: { "_id.year": 1, "_id.month": 1, "_id.week": 1, "_id.day": 1 } }
  ];

  const [usageStats, users, userUsage] = await Promise.all([
    File.aggregate(timeGroupPipeline),
    User.find({ tenantId: tenantObjectId }).sort({ createdAt: -1 }).lean(),
    File.aggregate([
      { $match: { tenantId: tenantObjectId } },
      {
        $group: {
          _id: "$ownerId",
          storageUsedBytes: { $sum: { $ifNull: ["$size", 0] } },
          filesCount: { $sum: 1 } }
      }
    ])
  ]);

  const userUsageMap = new Map(userUsage.map((entry) => [String(entry._id), entry]));
  const usageSeries = buildTimeSeries(range, usageStats);
  let usersConsumption = buildUserConsumption(users, userUsageMap, getEffectiveQuotaPolicy(tenant));

  const searchTerm = String(options.search || '').trim().toLowerCase();
  if (searchTerm) {
    usersConsumption = usersConsumption.filter((user) =>
      user.name.toLowerCase().includes(searchTerm) || user.email.toLowerCase().includes(searchTerm)
    );
  }

  const sortBy = String(options.sortBy || 'storageUsedBytes');
  const sortDirection = String(options.sortDirection || 'desc') === 'asc' ? 1 : -1;

  const supportedSortFields = new Set(['name', 'storageUsedBytes', 'storageUsedPercent', 'filesCount']);
  if (supportedSortFields.has(sortBy)) {
    usersConsumption.sort((left, right) => {
      const leftValue = left[sortBy];
      const rightValue = right[sortBy];

      if (typeof leftValue === 'string' && typeof rightValue === 'string') {
        return leftValue.localeCompare(rightValue) * sortDirection;
      }

      return (Number(leftValue) - Number(rightValue)) * sortDirection;
    });
  }

  const page = Math.max(Number(options.page) || 1, 1);
  const limit = Math.min(Math.max(Number(options.limit) || 8, 1), 50);
  const totalUsers = usersConsumption.length;
  const start = (page - 1) * limit;
  const paginatedUsers = usersConsumption.slice(start, start + limit);

  const saturationForecast = buildSaturationForecast(
    quota.storageUsed,
    quota.storageLimit,
    usageSeries
  );

  const activitySummary = await buildActivitySummary(id, range);

  return {
    range,
    rangeLabel: getRangeLabel(range),
    quota: {
      ...quota,
      remainingStorageBytes: quota.storageLimit !== null
        ? Math.max((quota.storageLimit || 0) - (quota.storageUsed || 0), 0)
        : null
    },
    usageSeries,
    users: paginatedUsers,
    usersTotal: totalUsers,
    usersPage: page,
    usersLimit: limit,
    saturationForecast,
    activitySummary,
    generatedAt: new Date().toISOString()
  };
};

// UPDATE
export const updateTenant = async (id, data) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Invalid Tenant ID");
  }

  const tenant = await Tenant.findById(id);
  if (!tenant) {
    throw new Error("Tenant not found");
  }

  // Vérifier unicité domain si modifié
  if (data.domain && data.domain !== tenant.domain) {
    const existing = await Tenant.findOne({ domain: data.domain });
    if (existing) {
      throw new Error("Domain already in use");
    }
  }

  if (data.subscriptionPlan) {
    const planExists = await Plan.exists({ slug: String(data.subscriptionPlan).toLowerCase() });
    if (!planExists) {
      throw new Error("Invalid subscription plan");
    }
    data.subscriptionPlan = String(data.subscriptionPlan).toLowerCase();
  }

  const updated = await Tenant.findByIdAndUpdate(id, data, {
    returnDocument: "after",
    runValidators: true,
  });

  return updated;
};

export const updateTenantQuota = async (id, payload = {}, requester = null) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Invalid Tenant ID");
  }

  const tenant = await Tenant.findById(id);
  if (!tenant) {
    throw new Error("Tenant not found");
  }

  const previousQuota = {
    subscriptionPlan: tenant.subscriptionPlan,
    quotaOverrides: tenant.quotaOverrides
  };

  if (payload.subscriptionPlan) {
    const normalizedPlan = String(payload.subscriptionPlan).toLowerCase();
    const planExists = await Plan.exists({ slug: normalizedPlan });
    if (!planExists) {
      throw new Error("Invalid subscription plan");
    }
    tenant.subscriptionPlan = normalizedPlan;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "quotaOverrides")) {
    tenant.quotaOverrides = payload.quotaOverrides || null;
  }

  const usage = await getTenantUsageSnapshot(id);
  assertQuotaConfigCanApply(usage, getEffectiveQuotaPolicy(tenant));

  await tenant.save();

  await recordQuotaEvent({
    tenantId: tenant._id,
    userId: requester?.userId || requester?._id || null,
    action: "quota_config_updated",
    resourceId: tenant._id,
    resourceType: "tenant",
    metadata: {
      previous: previousQuota,
      next: {
        subscriptionPlan: tenant.subscriptionPlan,
        quotaOverrides: tenant.quotaOverrides
      },
      usage
    },
    ip: requester?.ipAddress || null,
    userAgent: requester?.userAgent || null
  });

  return getTenantQuota(id);
};

// DELETE
export const deleteTenant = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Invalid Tenant ID");
  }

  const tenant = await Tenant.findById(id);

  if (!tenant) {
    throw new Error("Tenant not found");
  }

  await tenant.deleteOne();

  return true;
};

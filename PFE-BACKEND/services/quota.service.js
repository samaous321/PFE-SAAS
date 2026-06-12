import mongoose from "mongoose";
import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
import File from "../models/File.js";
import Folder from "../models/Folder.js";
import Plan from "../models/Plan.js";
import activityService from "./activity.service.js";
import { notifyQuotaThresholdReached } from "./in-app-notification.service.js";

const MB = 1024 * 1024;
const GB = 1024 * MB;
const QUOTA_WARNING_THRESHOLD = 80;
const QUOTA_CRITICAL_THRESHOLD = 90;
const QUOTA_FULL_THRESHOLD = 100;

const DEFAULT_PLAN_DEFINITIONS = [
  {
    slug: "small",
    name: "SMALL",
    storageBytes: 10 * GB,
    maxUsers: 25,
    maxFiles: 10000,
    maxFolders: 200,
    userStorageBytes: 10 * GB,
    userMaxFiles: 2000,
    userDailyUploadBytes: 2 * GB,
    isDefault: true,
    sortOrder: 1
  },
  {
    slug: "standard",
    name: "STANDARD",
    storageBytes: 20 * GB,
    maxUsers: 50,
    maxFiles: 50000,
    maxFolders: 500,
    userStorageBytes: 20 * GB,
    userMaxFiles: 5000,
    userDailyUploadBytes: 5 * GB,
    isDefault: true,
    sortOrder: 2
  },
  {
    slug: "large",
    name: "LARGE",
    storageBytes: 30 * GB,
    maxUsers: null,
    maxFiles: null,
    maxFolders: null,
    userStorageBytes: 30 * GB,
    userMaxFiles: null,
    userDailyUploadBytes: null,
    isDefault: true,
    sortOrder: 3
  },
  {
    slug: "unlimited",
    name: "UNLIMITED",
    storageBytes: null,
    maxUsers: null,
    maxFiles: null,
    maxFolders: null,
    userStorageBytes: null,
    userMaxFiles: null,
    userDailyUploadBytes: null,
    isDefault: true,
    sortOrder: 4
  }
];

let PLAN_QUOTAS = Object.fromEntries(
  DEFAULT_PLAN_DEFINITIONS.map((plan) => [plan.slug, {
    tenant: {
      storageBytes: plan.storageBytes,
      maxUsers: plan.maxUsers,
      maxFiles: plan.maxFiles,
      maxFolders: plan.maxFolders
    },
    user: {
      storageBytes: plan.userStorageBytes,
      maxFiles: plan.userMaxFiles,
      maxDailyUploadBytes: plan.userDailyUploadBytes
    }
  }])
);

const normalizePlan = (plan) => PLAN_QUOTAS[plan] ? plan : "small";

const toQuotaPolicy = (planDoc) => ({
  tenant: {
    storageBytes: planDoc?.storageBytes ?? null,
    maxUsers: planDoc?.maxUsers ?? null,
    maxFiles: planDoc?.maxFiles ?? null,
    maxFolders: planDoc?.maxFolders ?? null
  },
  user: {
    storageBytes: planDoc?.userStorageBytes ?? null,
    maxFiles: planDoc?.userMaxFiles ?? null,
    maxDailyUploadBytes: planDoc?.userDailyUploadBytes ?? null
  }
});

const rebuildQuotaCache = (plans = []) => {
  const quotaMap = Object.fromEntries(
    DEFAULT_PLAN_DEFINITIONS.map((plan) => [plan.slug, toQuotaPolicy(plan)])
  );

  plans.forEach((plan) => {
    quotaMap[plan.slug] = toQuotaPolicy(plan);
  });

  PLAN_QUOTAS = quotaMap;
  return quotaMap;
};

const seedDefaultPlans = async () => {
  const existingCount = await Plan.countDocuments({});
  if (existingCount > 0) {
    await Promise.all(
      DEFAULT_PLAN_DEFINITIONS.map((plan) =>
        Plan.updateOne(
          { slug: plan.slug },
          { $setOnInsert: plan },
          { upsert: true }
        )
      )
    );
    return;
  }

  await Plan.insertMany(DEFAULT_PLAN_DEFINITIONS, { ordered: true });
};

export const hydratePlanQuotas = async () => {
  await seedDefaultPlans();
  const plans = await Plan.find({}).sort({ sortOrder: 1, createdAt: 1 }).lean();
  rebuildQuotaCache(plans);
  return plans;
};

export const getPlanDefinitions = () => DEFAULT_PLAN_DEFINITIONS;

export const getPlanQuotas = () => PLAN_QUOTAS;

const pickOverride = (overrideValue, defaultValue) => {
  if (overrideValue === null || overrideValue === undefined) {
    return defaultValue;
  }

  return overrideValue;
};

export class QuotaLimitError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "QuotaLimitError";
    this.code = "QUOTA_LIMIT_EXCEEDED";
    this.statusCode = 409;
    this.details = details;
  }
}

const toObjectId = (value, label = "id") => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new Error(`Invalid ${label}`);
  }

  return new mongoose.Types.ObjectId(value);
};

const isLimited = (limit) => typeof limit === "number" && Number.isFinite(limit) && limit > 0;

const getUsagePercent = (used, limit) => {
  if (!isLimited(limit)) {
    return null;
  }

  return Math.min((Number(used || 0) / limit) * 100, 100);
};

const getQuotaState = (percent) => {
  if (percent === null || percent === undefined) return "unlimited";
  if (percent >= QUOTA_FULL_THRESHOLD) return "full";
  if (percent >= QUOTA_CRITICAL_THRESHOLD) return "critical";
  if (percent >= QUOTA_WARNING_THRESHOLD) return "warning";
  return "healthy";
};

const evaluateLimit = ({ key, scope, label, used = 0, limit = null, increment = 0 }) => {
  const normalizedUsed = Number(used || 0);
  const normalizedIncrement = Number(increment || 0);
  const projected = normalizedUsed + normalizedIncrement;

  if (!isLimited(limit)) {
    return {
      key,
      scope,
      label,
      used: normalizedUsed,
      projected,
      increment: normalizedIncrement,
      limit: null,
      remaining: null,
      percent: null,
      projectedPercent: null,
      state: "unlimited",
      wouldExceed: false
    };
  }

  const percent = getUsagePercent(normalizedUsed, limit);
  const projectedPercent = getUsagePercent(projected, limit);

  return {
    key,
    scope,
    label,
    used: normalizedUsed,
    projected,
    increment: normalizedIncrement,
    limit,
    remaining: Math.max(limit - projected, 0),
    percent,
    projectedPercent,
    state: getQuotaState(projectedPercent),
    wouldExceed: projected > limit
  };
};

const buildQuotaAlerts = (metrics = []) =>
  metrics
    .filter((metric) => metric.projectedPercent !== null && metric.projectedPercent >= QUOTA_WARNING_THRESHOLD)
    .map((metric) => ({
      type: "quota",
      key: metric.key,
      scope: metric.scope,
      label: metric.label,
      severity: metric.projectedPercent >= QUOTA_FULL_THRESHOLD
        ? "full"
        : metric.projectedPercent >= QUOTA_CRITICAL_THRESHOLD
          ? "critical"
          : "warning",
      threshold: metric.projectedPercent >= QUOTA_FULL_THRESHOLD
        ? QUOTA_FULL_THRESHOLD
        : metric.projectedPercent >= QUOTA_CRITICAL_THRESHOLD
          ? QUOTA_CRITICAL_THRESHOLD
          : QUOTA_WARNING_THRESHOLD,
      used: metric.projected,
      limit: metric.limit,
      percent: Math.round(metric.projectedPercent),
      remaining: metric.remaining
    }));

export const recordQuotaEvent = async ({
  tenantId,
  userId = null,
  action,
  resourceId = null,
  resourceType = null,
  metadata = {},
  ip = null,
  userAgent = null
}) => {
  try {
    await activityService.logActivity({
      userId,
      tenantId,
      type: "quota",
      action,
      resourceId,
      resourceType,
      metadata,
      ip,
      userAgent
    });
  } catch (error) {
    console.warn("[Quota] failed to record quota event:", error.message);
  }
};

export const getQuotaPolicyByPlan = (plan = "free") => {
  const normalizedPlan = normalizePlan(plan);
  return PLAN_QUOTAS[normalizedPlan] || PLAN_QUOTAS.small;
};

export const getEffectiveQuotaPolicy = (tenant) => {
  const basePolicy = getQuotaPolicyByPlan(tenant?.subscriptionPlan);
  const overrides = tenant?.quotaOverrides || {};

  return {
    plan: normalizePlan(tenant?.subscriptionPlan),
    tenant: {
      storageBytes: pickOverride(overrides?.tenant?.storageBytes, basePolicy.tenant.storageBytes),
      maxUsers: pickOverride(overrides?.tenant?.maxUsers, basePolicy.tenant.maxUsers),
      maxFiles: pickOverride(overrides?.tenant?.maxFiles, basePolicy.tenant.maxFiles),
      maxFolders: pickOverride(overrides?.tenant?.maxFolders, basePolicy.tenant.maxFolders)
    },
    user: {
      storageBytes: pickOverride(overrides?.user?.storageBytes, basePolicy.user.storageBytes),
      maxFiles: pickOverride(overrides?.user?.maxFiles, basePolicy.user.maxFiles),
      maxDailyUploadBytes: pickOverride(overrides?.user?.maxDailyUploadBytes, basePolicy.user.maxDailyUploadBytes)
    }
  };
};

export const getTenantQuotaSummary = async (tenantId) => {
  const tenantObjectId = toObjectId(tenantId, "tenantId");
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw new Error("Tenant not found");
  }

  const policy = getEffectiveQuotaPolicy(tenant);

  const [usage, usersCount, foldersCount] = await Promise.all([
    File.aggregate([
      { $match: { tenantId: tenantObjectId } },
      {
        $group: {
          _id: null,
          totalStorageUsed: { $sum: { $ifNull: ["$size", 0] } },
          totalFiles: { $sum: 1 }
        }
      }
    ]),
    User.countDocuments({ tenantId: tenantObjectId }),
    Folder.countDocuments({ tenantId: tenantObjectId })
  ]);

  const totalStorageUsed = usage?.[0]?.totalStorageUsed || 0;
  const totalFiles = usage?.[0]?.totalFiles || 0;
  const metrics = [
    evaluateLimit({
      key: "tenant.storage",
      scope: "tenant",
      label: "Stockage tenant",
      used: totalStorageUsed,
      limit: policy.tenant.storageBytes
    }),
    evaluateLimit({
      key: "tenant.users",
      scope: "tenant",
      label: "Utilisateurs",
      used: usersCount,
      limit: policy.tenant.maxUsers
    }),
    evaluateLimit({
      key: "tenant.files",
      scope: "tenant",
      label: "Fichiers",
      used: totalFiles,
      limit: policy.tenant.maxFiles
    }),
    evaluateLimit({
      key: "tenant.folders",
      scope: "tenant",
      label: "Dossiers",
      used: foldersCount,
      limit: policy.tenant.maxFolders
    })
  ];
  const alerts = buildQuotaAlerts(metrics);

  return {
    tenantId: tenant._id.toString(),
    tenantName: tenant.name,
    tenantStatus: tenant.status,
    plan: policy.plan,
    storageUsedBytes: totalStorageUsed,
    storageLimitBytes: policy.tenant.storageBytes,
    storageUsedPercent: getUsagePercent(totalStorageUsed, policy.tenant.storageBytes),
    totalFiles,
    totalFilesLimit: policy.tenant.maxFiles,
    usersCount,
    usersLimit: policy.tenant.maxUsers,
    foldersCount,
    foldersLimit: policy.tenant.maxFolders,
    userStorageLimitBytes: policy.user.storageBytes,
    userMaxFiles: policy.user.maxFiles,
    userDailyUploadLimitBytes: policy.user.maxDailyUploadBytes,
    quotaStatus: alerts.some((alert) => alert.severity === "full")
      ? "full"
      : alerts.some((alert) => alert.severity === "critical")
        ? "critical"
        : alerts.some((alert) => alert.severity === "warning")
          ? "warning"
          : "healthy",
    alerts,
    metrics,
    thresholds: {
      warning: QUOTA_WARNING_THRESHOLD,
      critical: QUOTA_CRITICAL_THRESHOLD,
      full: QUOTA_FULL_THRESHOLD
    }
  };
};

export const assertTenantPlanIsActive = async (tenant) => {
  if (!tenant?.subscriptionPlan) {
    return true;
  }

  const planSlug = String(tenant.subscriptionPlan).trim().toLowerCase();
  const plan = await Plan.findOne({ slug: planSlug });

  if (plan && plan.isActive === false) {
    throw new QuotaLimitError("Upload blocked because tenant subscription plan is inactive", {
      plan: planSlug,
      reason: "inactive_plan"
    });
  }

  if (!plan && !PLAN_QUOTAS[planSlug]) {
    throw new QuotaLimitError("Upload blocked because tenant subscription plan is unavailable", {
      plan: planSlug,
      reason: "missing_plan"
    });
  }

  return true;
};

export const assertUploadWithinQuota = async ({ tenantId, userId, fileSize }) => {
  const tenantObjectId = toObjectId(tenantId, "tenantId");
  const userObjectId = toObjectId(userId, "userId");
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw new Error("Tenant not found");
  }

  await assertTenantPlanIsActive(tenant);
  const policy = getEffectiveQuotaPolicy(tenant);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [tenantUsage, userUsage, dailyUploadUsage] = await Promise.all([
    File.aggregate([
      { $match: { tenantId: tenantObjectId } },
      {
        $group: {
          _id: null,
          storageBytes: { $sum: { $ifNull: ["$size", 0] } },
          fileCount: { $sum: 1 }
        }
      }
    ]),
    File.aggregate([
      { $match: { tenantId: tenantObjectId, ownerId: userObjectId } },
      {
        $group: {
          _id: null,
          storageBytes: { $sum: { $ifNull: ["$size", 0] } },
          fileCount: { $sum: 1 }
        }
      }
    ]),
    File.aggregate([
      {
        $match: {
          tenantId: tenantObjectId,
          ownerId: userObjectId,
          createdAt: { $gte: todayStart }
        }
      },
      {
        $group: {
          _id: null,
          storageBytes: { $sum: { $ifNull: ["$size", 0] } },
          fileCount: { $sum: 1 }
        }
      }
    ])
  ]);

  const tenantStorageUsed = tenantUsage?.[0]?.storageBytes || 0;
  const tenantFilesUsed = tenantUsage?.[0]?.fileCount || 0;
  const userStorageUsed = userUsage?.[0]?.storageBytes || 0;
  const userFilesUsed = userUsage?.[0]?.fileCount || 0;
  const userDailyUploadUsed = dailyUploadUsage?.[0]?.storageBytes || 0;
  const uploadSize = Number(fileSize || 0);

  const metrics = [
    evaluateLimit({
      key: "tenant.storage",
      scope: "tenant",
      label: "Stockage tenant",
      used: tenantStorageUsed,
      limit: policy.tenant.storageBytes,
      increment: uploadSize
    }),
    evaluateLimit({
      key: "tenant.files",
      scope: "tenant",
      label: "Fichiers tenant",
      used: tenantFilesUsed,
      limit: policy.tenant.maxFiles,
      increment: 1
    }),
    evaluateLimit({
      key: "user.storage",
      scope: "user",
      label: "Stockage utilisateur",
      used: userStorageUsed,
      limit: policy.user.storageBytes,
      increment: uploadSize
    }),
    evaluateLimit({
      key: "user.files",
      scope: "user",
      label: "Fichiers utilisateur",
      used: userFilesUsed,
      limit: policy.user.maxFiles,
      increment: 1
    }),
    evaluateLimit({
      key: "user.dailyUpload",
      scope: "user",
      label: "Upload quotidien utilisateur",
      used: userDailyUploadUsed,
      limit: policy.user.maxDailyUploadBytes,
      increment: uploadSize
    })
  ];
  const exceededMetric = metrics.find((metric) => metric.wouldExceed);

  if (exceededMetric) {
    await recordQuotaEvent({
      tenantId,
      userId,
      action: "quota_block",
      resourceType: "upload",
      metadata: {
        plan: policy.plan,
        metric: exceededMetric,
        fileSize: uploadSize
      }
    });

    const blockAlerts = buildQuotaAlerts(metrics);
    console.log("[Quota Upload Block] Calling notifyQuotaThresholdReached with", blockAlerts.length, "alerts for tenantId:", tenantId);

    await notifyQuotaThresholdReached({
      tenantId,
      tenantName: tenant?.name || null,
      subscriptionPlan: policy.plan,
      resourceType: "upload",
      alerts: blockAlerts
    });

    throw new QuotaLimitError(`${exceededMetric.label} quota exceeded`, {
      plan: policy.plan,
      metric: exceededMetric,
      alerts: buildQuotaAlerts(metrics)
    });
  }

  const warnings = buildQuotaAlerts(metrics);
  if (warnings.length > 0) {
    await recordQuotaEvent({
      tenantId,
      userId,
      action: "quota_warning",
      resourceType: "upload",
      metadata: {
        plan: policy.plan,
        warnings,
        fileSize: uploadSize
      }
    });

    console.log("[Quota Upload Warning] Calling notifyQuotaThresholdReached with", warnings.length, "warnings for tenantId:", tenantId);

    await notifyQuotaThresholdReached({
      tenantId,
      tenantName: tenant?.name || null,
      subscriptionPlan: policy.plan,
      resourceType: "upload",
      alerts: warnings
    });
  }

  return {
    allowed: true,
    warnings,
    metrics,
    policy,
    tenantUsage: {
      storageBytes: tenantStorageUsed,
      fileCount: tenantFilesUsed
    },
    userUsage: {
      storageBytes: userStorageUsed,
      fileCount: userFilesUsed,
      dailyUploadBytes: userDailyUploadUsed
    }
  };
};

export const assertTenantUserWithinQuota = async ({ tenantId, increment = 1, userId = null }) => {
  const tenantObjectId = toObjectId(tenantId, "tenantId");
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw new Error("Tenant not found");
  }

  const policy = getEffectiveQuotaPolicy(tenant);
  const usersCount = await User.countDocuments({ tenantId: tenantObjectId });
  const metric = evaluateLimit({
    key: "tenant.users",
    scope: "tenant",
    label: "Utilisateurs tenant",
    used: usersCount,
    limit: policy.tenant.maxUsers,
    increment
  });

  if (metric.wouldExceed) {
    await recordQuotaEvent({
      tenantId,
      userId,
      action: "quota_block",
      resourceType: "user",
      metadata: { plan: policy.plan, metric }
    });

    await notifyQuotaThresholdReached({
      tenantId,
      tenantName: tenant?.name || null,
      subscriptionPlan: policy.plan,
      resourceType: "user",
      alerts: buildQuotaAlerts([metric])
    });

    throw new QuotaLimitError("Tenant user quota exceeded", {
      plan: policy.plan,
      metric
    });
  }

  const warnings = buildQuotaAlerts([metric]);
  if (warnings.length > 0) {
    await recordQuotaEvent({
      tenantId,
      userId,
      action: "quota_warning",
      resourceType: "user",
      metadata: { plan: policy.plan, warnings }
    });

    await notifyQuotaThresholdReached({
      tenantId,
      tenantName: tenant?.name || null,
      subscriptionPlan: policy.plan,
      resourceType: "user",
      alerts: warnings
    });
  }

  return { allowed: true, warnings, metric, policy };
};

export const assertTenantFolderWithinQuota = async ({ tenantId, increment = 1, userId = null }) => {
  const tenantObjectId = toObjectId(tenantId, "tenantId");
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw new Error("Tenant not found");
  }

  const policy = getEffectiveQuotaPolicy(tenant);
  const foldersCount = await Folder.countDocuments({ tenantId: tenantObjectId });
  const metric = evaluateLimit({
    key: "tenant.folders",
    scope: "tenant",
    label: "Dossiers tenant",
    used: foldersCount,
    limit: policy.tenant.maxFolders,
    increment
  });

  if (metric.wouldExceed) {
    await recordQuotaEvent({
      tenantId,
      userId,
      action: "quota_block",
      resourceType: "folder",
      metadata: { plan: policy.plan, metric }
    });

    await notifyQuotaThresholdReached({
      tenantId,
      tenantName: tenant?.name || null,
      subscriptionPlan: policy.plan,
      resourceType: "folder",
      alerts: buildQuotaAlerts([metric])
    });

    throw new QuotaLimitError("Tenant folder quota exceeded", {
      plan: policy.plan,
      metric
    });
  }

  const warnings = buildQuotaAlerts([metric]);
  if (warnings.length > 0) {
    await recordQuotaEvent({
      tenantId,
      userId,
      action: "quota_warning",
      resourceType: "folder",
      metadata: { plan: policy.plan, warnings }
    });

    await notifyQuotaThresholdReached({
      tenantId,
      tenantName: tenant?.name || null,
      subscriptionPlan: policy.plan,
      resourceType: "folder",
      alerts: warnings
    });
  }

  return { allowed: true, warnings, metric, policy };
};

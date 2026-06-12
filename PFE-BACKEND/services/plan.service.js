import Plan from "../models/Plan.js";
import Tenant from "../models/Tenant.js";
import { hydratePlanQuotas, recordQuotaEvent } from "./quota.service.js";

const DEFAULT_PLAN_SLUGS = new Set(["small", "standard", "large", "unlimited"]);
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const normalizeSlug = (value) => String(value || "").trim().toLowerCase();

const nullableNumber = (value, { integer = false } = {}) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error("Plan limits must be positive numbers or null");
  }

  if (normalized === 0) {
    return null;
  }

  return integer ? Math.floor(normalized) : normalized;
};

const toPlanPayload = (data = {}) => ({
  slug: normalizeSlug(data.slug),
  name: String(data.name || "").trim(),
  description: String(data.description || "").trim(),
  storageBytes: nullableNumber(data.storageBytes),
  maxUsers: nullableNumber(data.maxUsers, { integer: true }),
  maxFiles: nullableNumber(data.maxFiles, { integer: true }),
  maxFolders: nullableNumber(data.maxFolders, { integer: true }),
  userStorageBytes: nullableNumber(data.userStorageBytes),
  userMaxFiles: nullableNumber(data.userMaxFiles, { integer: true }),
  userDailyUploadBytes: nullableNumber(data.userDailyUploadBytes),
  isActive: data.isActive ?? true,
  sortOrder: Number.isFinite(Number(data.sortOrder)) ? Number(data.sortOrder) : 0,
  isDefault: Boolean(data.isDefault)
});

const validatePlanPayload = (payload) => {
  if (!payload.slug) {
    throw new Error("Plan slug is required");
  }

  if (!SLUG_PATTERN.test(payload.slug)) {
    throw new Error("Plan slug must use lowercase letters, numbers and hyphens");
  }

  if (!payload.name) {
    throw new Error("Plan name is required");
  }
};

export const getAllPlans = async () => {
  await hydratePlanQuotas();
  return Plan.find({}).sort({ sortOrder: 1, createdAt: 1 });
};

export const getActivePlans = async () => {
  await hydratePlanQuotas();
  return Plan.find({ isActive: true }).sort({ sortOrder: 1, createdAt: 1 });
};

export const getPlanBySlug = async (slug) => {
  const normalizedSlug = normalizeSlug(slug);
  const plan = await Plan.findOne({ slug: normalizedSlug });

  if (!plan) {
    throw new Error("Plan not found");
  }

  return plan;
};

export const createPlan = async (data, requester = null) => {
  const payload = toPlanPayload(data);
  validatePlanPayload(payload);

  const existing = await Plan.findOne({ slug: payload.slug });
  if (existing) {
    throw new Error("Plan slug already exists");
  }

  const plan = await Plan.create(payload);
  await hydratePlanQuotas();
  await recordQuotaEvent({
    tenantId: requester?.tenantId || null,
    userId: requester?.userId || requester?._id || null,
    action: "plan_created",
    resourceId: plan._id,
    resourceType: "plan",
    metadata: { slug: plan.slug, name: plan.name, payload }
  });
  return plan;
};

export const updatePlan = async (slug, data, requester = null) => {
  const normalizedSlug = normalizeSlug(slug);
  const payload = toPlanPayload({ ...data, slug: normalizedSlug });
  validatePlanPayload(payload);

  const plan = await Plan.findOne({ slug: normalizedSlug });
  if (!plan) {
    throw new Error("Plan not found");
  }

  if (plan.isDefault && payload.isActive === false) {
    throw new Error("Default plans cannot be disabled");
  }

  const previous = plan.toObject();
  plan.name = payload.name;
  if (payload.description !== undefined) {
    plan.description = payload.description;
  }
  plan.storageBytes = payload.storageBytes;
  plan.maxUsers = payload.maxUsers;
  plan.maxFiles = payload.maxFiles;
  plan.maxFolders = payload.maxFolders;
  plan.userStorageBytes = payload.userStorageBytes;
  plan.userMaxFiles = payload.userMaxFiles;
  plan.userDailyUploadBytes = payload.userDailyUploadBytes;
  plan.isActive = payload.isActive;
  plan.sortOrder = payload.sortOrder;

  await plan.save();
  await hydratePlanQuotas();
  await recordQuotaEvent({
    tenantId: requester?.tenantId || null,
    userId: requester?.userId || requester?._id || null,
    action: "plan_updated",
    resourceId: plan._id,
    resourceType: "plan",
    metadata: {
      slug: plan.slug,
      previous,
      next: plan.toObject()
    }
  });
  return plan;
};

export const deletePlan = async (slug, requester = null) => {
  const normalizedSlug = normalizeSlug(slug);
  if (DEFAULT_PLAN_SLUGS.has(normalizedSlug)) {
    throw new Error("Default plans cannot be deleted");
  }

  const plan = await Plan.findOne({ slug: normalizedSlug });
  if (!plan) {
    throw new Error("Plan not found");
  }

  const tenantsUsingPlan = await Tenant.countDocuments({ subscriptionPlan: normalizedSlug });
  const wasDeleted = tenantsUsingPlan === 0;
  const action = wasDeleted ? "plan_deleted" : "plan_disabled";

  if (wasDeleted) {
    await plan.deleteOne();
  } else {
    plan.isActive = false;
    await plan.save();
  }

  await hydratePlanQuotas();
  await recordQuotaEvent({
    tenantId: requester?.tenantId || null,
    userId: requester?.userId || requester?._id || null,
    action,
    resourceId: plan._id,
    resourceType: "plan",
    metadata: {
      slug: plan.slug,
      tenantsUsingPlan,
      deleted: wasDeleted
    }
  });

  return true;
};

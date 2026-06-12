import Activity from "../models/Activity.js";

async function logActivity({ userId, tenantId, type, action, resourceId, resourceType, metadata, ip, userAgent }) {
  const doc = new Activity({ userId, tenantId, type, action, resourceId, resourceType, metadata, ip, userAgent });
  await doc.save();
  return doc;
}

async function queryActivities({ userId, tenantId, page = 1, limit = 20, filters = {} }) {
  const q = { ...(userId ? { userId } : {}), ...(tenantId ? { tenantId } : {}), ...filters };
  const lim = parseInt(limit, 10) || 20;
  const skip = Math.max(0, page - 1) * lim;
  const [items, total] = await Promise.all([
    Activity.find(q).sort({ createdAt: -1 }).skip(skip).limit(lim).lean(),
    Activity.countDocuments(q),
  ]);
  const pages = Math.max(1, Math.ceil(total / lim));
  return { items, total, page, limit: lim, pages };
}

export default { logActivity, queryActivities };

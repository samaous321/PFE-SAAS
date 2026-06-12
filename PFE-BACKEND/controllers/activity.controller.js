import activityService from "../services/activity.service.js";

async function getMyActivities(req, res) {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    const page = parseInt(req.query.page || "1", 10);
    const limit = parseInt(req.query.limit || "20", 10);
    const filters = {};
    if (req.query.type) filters.type = req.query.type;
    if (req.query.action) filters.action = req.query.action;
    if (req.query.startDate || req.query.endDate) {
      filters.createdAt = {};
      if (req.query.startDate) filters.createdAt.$gte = new Date(req.query.startDate);
      if (req.query.endDate) filters.createdAt.$lte = new Date(req.query.endDate);
    }

    const result = await activityService.queryActivities({ userId: user.userId || user._id, tenantId: user.tenantId, page, limit, filters });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch activities" });
  }
}

export default { getMyActivities };

import mongoose from "mongoose";
import { getEffectiveQuotaPolicy } from "./quota.service.js";

/**
 * User Statistics Service
 * Provides comprehensive analytics for user activity, file management, security, and sharing
 */
class StatsService {
  constructor() {
    this.File = null;
    this.SharedLink = null;
    this.ShareHistory = null;
    this.User = null;
    this.Tenant = null;
  }

  async initializeModels() {
    if (!this.File) {
      this.File = (await import("../models/File.js")).default;
      this.SharedLink = (await import("../models/SharedLink.js")).default;
      this.ShareHistory = (await import("../models/ShareHistory.js")).default;
      this.User = (await import("../models/User.js")).default;
      this.Tenant = (await import("../models/Tenant.js")).default;
    }
  }

  /**
   * Build MongoDB aggregation match conditions based on filters
   */
  buildMatchConditions(userId, tenantId, filters = {}) {
    const match = {
      ownerId: new mongoose.Types.ObjectId(userId),
      tenantId: new mongoose.Types.ObjectId(tenantId)
    };

    if (filters.startDate || filters.endDate) {
      match.createdAt = {};
      if (filters.startDate) match.createdAt.$gte = new Date(filters.startDate);
      if (filters.endDate) match.createdAt.$lte = new Date(filters.endDate);
    }

    if (filters.fileType) {
      match.mimeType = { $regex: filters.fileType, $options: 'i' };
    }

    if (filters.status) {
      match.status = filters.status;
    }

    return match;
  }

  /**
   * Get file management statistics
   */
  async getFileManagementStats(userId, tenantId, filters = {}) {
    await this.initializeModels();

    const matchConditions = this.buildMatchConditions(userId, tenantId, filters);

    // Basic file counts
    const [fileStats] = await this.File.aggregate([
      { $match: matchConditions },
      {
        $group: {
          _id: null,
          uploads: { $sum: 1 },
          downloads: { $sum: { $ifNull: ["$downloadCount", 0] } },
          totalSize: { $sum: { $ifNull: ["$size", 0] } }
        }
      }
    ]);

    // Time-based trends (daily/weekly/monthly)
    const now = new Date();
    const trends = {};

    // Daily trend (last 30 days)
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const dailyUploads = await this.File.aggregate([
      {
        $match: {
          ...matchConditions,
          createdAt: { $gte: thirtyDaysAgo }
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
      { $sort: { "_id": 1 } }
    ]);

    // Weekly trend (last 12 weeks)
    const twelveWeeksAgo = new Date(now);
    twelveWeeksAgo.setDate(now.getDate() - 84);

    const weeklyUploads = await this.File.aggregate([
      {
        $match: {
          ...matchConditions,
          createdAt: { $gte: twelveWeeksAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%U", date: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id": 1 } }
    ]);

    // Monthly trend (last 12 months)
    const twelveMonthsAgo = new Date(now);
    twelveMonthsAgo.setMonth(now.getMonth() - 12);

    const monthlyUploads = await this.File.aggregate([
      {
        $match: {
          ...matchConditions,
          createdAt: { $gte: twelveMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m", date: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id": 1 } }
    ]);

    trends.daily = dailyUploads;
    trends.weekly = weeklyUploads;
    trends.monthly = monthlyUploads;

    return {
      uploads: fileStats?.uploads || 0,
      downloads: fileStats?.downloads || 0,
      totalSize: fileStats?.totalSize || 0,
      trends
    };
  }

  /**
   * Get file type distribution statistics
   */
  async getFileTypesStats(userId, tenantId, filters = {}) {
    await this.initializeModels();

    const matchConditions = this.buildMatchConditions(userId, tenantId, filters);

    const fileTypes = await this.File.aggregate([
      { $match: matchConditions },
      {
        $group: {
          _id: "$mimeType",
          count: { $sum: 1 },
          totalSize: { $sum: { $ifNull: ["$size", 0] } },
          avgSize: { $avg: { $ifNull: ["$size", 0] } }
        }
      },
      {
        $project: {
          type: "$_id",
          count: 1,
          totalSize: 1,
          avgSize: { $round: ["$avgSize", 2] }
        }
      },
      { $sort: { count: -1 } }
    ]);

    return {
      distribution: fileTypes,
      totalTypes: fileTypes.length
    };
  }

  /**
   * Get security statistics
   */
  async getSecurityStats(userId, tenantId, filters = {}) {
    await this.initializeModels();

    const matchConditions = this.buildMatchConditions(userId, tenantId, filters);

    const [securityStats] = await this.File.aggregate([
      { $match: matchConditions },
      {
        $group: {
          _id: null,
          totalFiles: { $sum: 1 },
          clean: {
            $sum: {
              $cond: [
                { $or: [
                  { $eq: ["$scanStatus", "clean"] },
                  { $eq: ["$scanMetadata.quarantineStatus", "clean"] }
                ]},
                1,
                0
              ]
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
          blocked: {
            $sum: {
              $cond: [{ $eq: ["$status", "blocked"] }, 1, 0]
            }
          },
          suspicious: {
            $sum: {
              $cond: [
                { $and: [
                  { $ne: ["$scanStatus", "clean"] },
                  { $ne: ["$scanStatus", "pending"] },
                  { $ne: ["$scanMetadata.quarantineStatus", "clean"] }
                ]},
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    return {
      totalScanned: securityStats?.totalFiles || 0,
      clean: securityStats?.clean || 0,
      quarantined: securityStats?.quarantined || 0,
      blocked: securityStats?.blocked || 0,
      suspicious: securityStats?.suspicious || 0
    };
  }

  /**
   * Get file analysis statistics
   */
  async getAnalysisStats(userId, tenantId, filters = {}) {
    await this.initializeModels();

    const matchConditions = this.buildMatchConditions(userId, tenantId, filters);

    const [analysisStats] = await this.File.aggregate([
      { $match: matchConditions },
      {
        $group: {
          _id: null,
          totalScanned: { $sum: 1 },
          scanSuccess: {
            $sum: {
              $cond: [
                { $in: ["$scanStatus", ["clean", "infected"]] },
                1,
                0
              ]
            }
          },
          scanFailed: {
            $sum: {
              $cond: [{ $eq: ["$scanStatus", "failed"] }, 1, 0]
            }
          }
        }
      }
    ]);

    // Risk score distribution (if available in scanMetadata)
    const riskDistribution = await this.File.aggregate([
      { $match: { ...matchConditions, "scanMetadata.validationReport.riskLevel": { $exists: true } } },
      {
        $group: {
          _id: "$scanMetadata.validationReport.riskLevel",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    return {
      totalScanned: analysisStats?.totalScanned || 0,
      scanSuccess: analysisStats?.scanSuccess || 0,
      scanFailed: analysisStats?.scanFailed || 0,
      riskScoreDistribution: riskDistribution
    };
  }

  /**
   * Get sharing statistics
   */
  async getSharingStats(userId, tenantId, filters = {}) {
    await this.initializeModels();

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);

    // Files shared by this user
    const sharedByMe = await this.SharedLink.countDocuments({
      createdBy: userObjectId,
      tenantId: tenantObjectId,
      ...(filters.startDate || filters.endDate ? {
        createdAt: {
          ...(filters.startDate && { $gte: new Date(filters.startDate) }),
          ...(filters.endDate && { $lte: new Date(filters.endDate) })
        }
      } : {})
    });

    // Files received by this user
    const sharedWithMe = await this.SharedLink.countDocuments({
      tenantId: tenantObjectId,
      $or: [
        { recipientUserIds: userObjectId },
        { recipientEmail: { $exists: true } }
      ],
      ...(filters.startDate || filters.endDate ? {
        createdAt: {
          ...(filters.startDate && { $gte: new Date(filters.startDate) }),
          ...(filters.endDate && { $lte: new Date(filters.endDate) })
        }
      } : {})
    });

    // Most shared files
    const mostSharedFiles = await this.SharedLink.aggregate([
      {
        $match: {
          createdBy: userObjectId,
          tenantId: tenantObjectId,
          ...(filters.startDate || filters.endDate ? {
            createdAt: {
              ...(filters.startDate && { $gte: new Date(filters.startDate) }),
              ...(filters.endDate && { $lte: new Date(filters.endDate) })
            }
          } : {})
        }
      },
      {
        $group: {
          _id: "$fileId",
          shareCount: { $sum: 1 },
          lastShared: { $max: "$createdAt" }
        }
      },
      {
        $lookup: {
          from: "files",
          localField: "_id",
          foreignField: "_id",
          as: "file"
        }
      },
      { $unwind: "$file" },
      {
        $project: {
          fileId: "$_id",
          filename: "$file.originalName",
          shareCount: 1,
          lastShared: 1
        }
      },
      { $sort: { shareCount: -1 } },
      { $limit: 10 }
    ]);

    // Most viewed/downloaded shared files (received by this user)
    const mostViewedShared = await this.ShareHistory.aggregate([
      {
        $match: {
          "sharedWith.userId": userObjectId,
          ...(filters.startDate || filters.endDate ? {
            createdAt: {
              ...(filters.startDate && { $gte: new Date(filters.startDate) }),
              ...(filters.endDate && { $lte: new Date(filters.endDate) })
            }
          } : {})
        }
      },
      {
        $group: {
          _id: "$fileId",
          viewCount: { $sum: 1 },
          lastViewed: { $max: "$createdAt" }
        }
      },
      {
        $lookup: {
          from: "files",
          localField: "_id",
          foreignField: "_id",
          as: "file"
        }
      },
      { $unwind: "$file" },
      {
        $project: {
          fileId: "$_id",
          filename: "$file.fileName",
          viewCount: 1,
          lastViewed: 1
        }
      },
      { $sort: { viewCount: -1 } },
      { $limit: 10 }
    ]);

    return {
      filesShared: sharedByMe,
      filesReceived: sharedWithMe,
      mostSharedFiles,
      mostViewedSharedFiles: mostViewedShared
    };
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(userId, tenantId, filters = {}) {
    await this.initializeModels();

    const matchConditions = this.buildMatchConditions(userId, tenantId, filters);

    // Total storage used
    const [storageStats] = await this.File.aggregate([
      { $match: matchConditions },
      {
        $group: {
          _id: null,
          totalSize: { $sum: { $ifNull: ["$size", 0] } },
          fileCount: { $sum: 1 }
        }
      }
    ]);

    // Storage by file type
    const storageByType = await this.File.aggregate([
      { $match: matchConditions },
      {
        $group: {
          _id: "$mimeType",
          totalSize: { $sum: { $ifNull: ["$size", 0] } },
          fileCount: { $sum: 1 }
        }
      },
      {
        $project: {
          type: "$_id",
          totalSize: 1,
          fileCount: 1,
          avgSize: { $round: [{ $divide: ["$totalSize", "$fileCount"] }, 2] }
        }
      },
      { $sort: { totalSize: -1 } }
    ]);

    // Largest files
    const largestFiles = await this.File.find(matchConditions)
      .sort({ size: -1 })
      .limit(10)
      .select('originalName size mimeType createdAt')
      .lean();

    return {
      totalUsed: storageStats?.totalSize || 0,
      fileCount: storageStats?.fileCount || 0,
      storageByType,
      largestFiles
    };
  }

  /**
   * Get tenant overview and quota context for the current user
   */
  async getTenantOverviewStats(userId, tenantId, filters = {}) {
    await this.initializeModels();

    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const tenant = await this.Tenant.findById(tenantId).lean();
    if (!tenant) {
      throw new Error("Tenant not found");
    }

    const quotaPolicy = getEffectiveQuotaPolicy(tenant);

    const [tenantUsage, userUsage, usersCount, activeUsersCount, tenantFilesCount, sharedLinksCount, userFilesCount] = await Promise.all([
      this.File.aggregate([
        { $match: { tenantId: tenantObjectId } },
        {
          $group: {
            _id: null,
            totalStorage: { $sum: { $ifNull: ["$size", 0] } },
            totalFiles: { $sum: 1 }
          }
        }
      ]),
      this.File.aggregate([
        { $match: { tenantId: tenantObjectId, ownerId: userObjectId } },
        {
          $group: {
            _id: null,
            totalStorage: { $sum: { $ifNull: ["$size", 0] } },
            totalFiles: { $sum: 1 }
          }
        }
      ]),
      this.User.countDocuments({ tenantId: tenantObjectId }),
      this.User.countDocuments({ tenantId: tenantObjectId, status: "active" }),
      this.File.countDocuments({ tenantId: tenantObjectId }),
      this.SharedLink.countDocuments({ tenantId: tenantObjectId }),
      this.File.countDocuments({ tenantId: tenantObjectId, ownerId: userObjectId })
    ]);

    const tenantStorageUsed = tenantUsage?.[0]?.totalStorage || 0;
    const userStorageUsed = userUsage?.[0]?.totalStorage || 0;

    return {
      tenant: {
        id: tenant._id.toString(),
        name: tenant.name,
        plan: quotaPolicy.plan,
        usersCount,
        activeUsersCount,
        filesCount: tenantFilesCount,
        sharedLinksCount,
        storageUsedBytes: tenantStorageUsed,
        storageLimitBytes: quotaPolicy.tenant.storageBytes,
        storageUsedPercent: quotaPolicy.tenant.storageBytes
          ? Math.min((tenantStorageUsed / quotaPolicy.tenant.storageBytes) * 100, 100)
          : null,
        averageFilesPerUser: usersCount > 0 ? tenantFilesCount / usersCount : 0,
        averageStoragePerUser: usersCount > 0 ? tenantStorageUsed / usersCount : 0
      },
      quota: {
        plan: quotaPolicy.plan,
        scope: quotaPolicy.user.storageBytes ? "user" : "tenant",
        user: {
          filesCount: userFilesCount,
          storageUsedBytes: userStorageUsed,
          storageLimitBytes: quotaPolicy.user.storageBytes,
          storageUsedPercent: quotaPolicy.user.storageBytes
            ? Math.min((userStorageUsed / quotaPolicy.user.storageBytes) * 100, 100)
            : null
        },
        tenant: {
          storageUsedBytes: tenantStorageUsed,
          storageLimitBytes: quotaPolicy.tenant.storageBytes,
          storageUsedPercent: quotaPolicy.tenant.storageBytes
            ? Math.min((tenantStorageUsed / quotaPolicy.tenant.storageBytes) * 100, 100)
            : null
        }
      }
    };
  }

  /**
   * Get user activity statistics
   */
  async getActivityStats(userId, tenantId, filters = {}) {
    await this.initializeModels();

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Login count and last login
    const user = await this.User.findById(userId).select('lastLogin').lean();

    // Activity trends (logins over time - if we had login logs)
    // For now, we'll use file creation as activity proxy
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const activityTrends = await this.File.aggregate([
      {
        $match: {
          ownerId: userObjectId,
          tenantId: new mongoose.Types.ObjectId(tenantId),
          createdAt: { $gte: thirtyDaysAgo },
          ...(filters.startDate || filters.endDate ? {
            createdAt: {
              ...(filters.startDate && { $gte: new Date(filters.startDate) }),
              ...(filters.endDate && { $lte: new Date(filters.endDate) })
            }
          } : {})
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          uploads: { $sum: 1 },
          downloads: { $sum: { $ifNull: ["$downloadCount", 0] } }
        }
      },
      { $sort: { "_id": 1 } }
    ]);

    return {
      loginCount: 1, // Placeholder - would need login logs
      lastLogin: user?.lastLogin ? user.lastLogin.toISOString() : null,
      activityTrends
    };
  }

  /**
   * Get comprehensive user statistics
   */
  async getUserStats(userId, tenantId, filters = {}) {
    await this.initializeModels();

    const [
      fileManagement,
      fileTypes,
      security,
      analysis,
      sharing,
      storage,
      activity,
      tenantOverview
    ] = await Promise.all([
      this.getFileManagementStats(userId, tenantId, filters),
      this.getFileTypesStats(userId, tenantId, filters),
      this.getSecurityStats(userId, tenantId, filters),
      this.getAnalysisStats(userId, tenantId, filters),
      this.getSharingStats(userId, tenantId, filters),
      this.getStorageStats(userId, tenantId, filters),
      this.getActivityStats(userId, tenantId, filters),
      this.getTenantOverviewStats(userId, tenantId, filters)
    ]);

    return {
      fileManagement,
      fileTypes,
      security,
      analysis,
      sharing,
      storage,
      activity,
      tenantOverview: tenantOverview.tenant,
      quota: tenantOverview.quota,
      filters: {
        applied: Object.keys(filters).length > 0,
        ...filters
      }
    };
  }
}

export default new StatsService();
import mongoose from 'mongoose';

const aiAnalysisLogSchema = new mongoose.Schema({
  // Allow either ObjectId or raw string identifiers to avoid logging failures in test/harness contexts
  userId: { type: mongoose.Schema.Types.Mixed, index: true },
  tenantId: { type: mongoose.Schema.Types.Mixed, index: true },
  fileId: { type: mongoose.Schema.Types.Mixed, index: true },
  linkId: { type: mongoose.Schema.Types.Mixed },
  module: { type: String, enum: ['upload', 'login', 'sharing'], index: true },
  operation: String,
  model: String,
  result: mongoose.Schema.Types.Mixed,
  rawResponse: String,
  success: { type: Boolean, default: false, index: true },
  error: String,
  validationError: String,
  duration: Number,
  createdAt: { type: Date, default: Date.now, index: true }
}, { collection: 'ai_analysis_logs' });

const AIAnalysisLog = mongoose.model('AIAnalysisLog', aiAnalysisLogSchema);

const buildMixedIdMatch = (value) => {
  if (value === undefined || value === null) {
    return undefined;
  }

  // Accept both representations because legacy logs may store ids as string or ObjectId.
  if (typeof value === 'string' && mongoose.Types.ObjectId.isValid(value)) {
    return { $in: [value, new mongoose.Types.ObjectId(value)] };
  }

  if (value instanceof mongoose.Types.ObjectId) {
    return { $in: [value, value.toString()] };
  }

  return value;
};

export const logAIAnalysis = async (logData) => {
  try {
    // Sanitize common id fields: if they look like ObjectId strings, keep as-is; otherwise store raw value
    const sanitized = { ...logData };
    ['userId', 'tenantId', 'fileId', 'linkId'].forEach((k) => {
      if (sanitized[k] === undefined) return;
      // leave as-is; Mixed schema accepts ObjectId or string
      if (typeof sanitized[k] === 'string' && mongoose.Types.ObjectId.isValid(sanitized[k])) {
        // convert to ObjectId for normalized storage
        sanitized[k] = mongoose.Types.ObjectId(sanitized[k]);
      }
    });

    await AIAnalysisLog.create(sanitized);
  } catch (error) {
    console.error('[AI Logging] Failed to save analysis log:', error.message);
  }
};

export const getAIAnalysisLogs = async (filters = {}) => {
  const query = {};
  if (filters.userId) query.userId = buildMixedIdMatch(filters.userId);
  if (filters.tenantId) query.tenantId = buildMixedIdMatch(filters.tenantId);
  if (filters.module) query.module = filters.module;
  if (filters.success !== undefined) query.success = filters.success;

  if (filters.dateFrom || filters.dateTo) {
    query.createdAt = {};
    if (filters.dateFrom) query.createdAt.$gte = filters.dateFrom;
    if (filters.dateTo) query.createdAt.$lte = filters.dateTo;
  }

  return await AIAnalysisLog.find(query).sort({ createdAt: -1 }).limit(filters.limit || 100);
};

export const getAIStatistics = async (tenantId) => {
  const tenantMatch = buildMixedIdMatch(tenantId);
  const match = tenantMatch ? { tenantId: tenantMatch } : {};
  const result = await AIAnalysisLog.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$module',
        totalCalls: { $sum: 1 },
        successfulCalls: { $sum: { $cond: ['$success', 1, 0] } },
        failedCalls: { $sum: { $cond: ['$success', 0, 1] } },
        avgDuration: { $avg: '$duration' }
      }
    }
  ]);

  return result;
};

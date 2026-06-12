import mongoose from "mongoose";
import { getDashboardStats, getAdminStatsReport } from "../services/admin.service.js";
import { getMalwareAlerts, manageQuarantinedFile as manageQuarantinedFileService } from "../services/file.service.js";
import { getAIStatistics, getAIAnalysisLogs } from "../utils/ai-logging.js";
import circuitBreaker from "../utils/ai-circuit-breaker.js";

export const getDashboard = async (req, res) => {
  try {
    // SECURITY: Pass user for role-based filtering
    const stats = await getDashboardStats(req.user);
    res.status(200).json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getAdminStats = async (req, res) => {
  try {
    // SECURITY: Pass user and filters for tenant-based restriction
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      tenantId: req.query.tenantId,
      tenantName: req.query.tenantName,
      fileType: req.query.fileType,
      status: req.query.status
    };
    const stats = await getAdminStatsReport(req.user, filters);
    res.status(200).json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getHealth = async (req, res) => {
  const dbReadyState = mongoose.connection.readyState;

  const dbStatus =
    dbReadyState === 1
      ? "up"
      : "down";

  const status = dbStatus === "up" ? "healthy" : "degraded";

  res.status(200).json({
    status,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    services: {
      database: dbStatus,
      api: "up"
    }
  });
};

export const getActivityLogs = async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);

  res.status(200).json({
    data: [],
    total: 0,
    page,
    limit
  });
};

export const getAdminAlerts = async (req, res) => {
  try {
    const alerts = await getMalwareAlerts(req.user, {
      tenantId: req.query.tenantId,
      ownerId: req.query.ownerId,
      scanStatus: req.query.scanStatus,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      sortBy: req.query.sortBy,
      page: req.query.page,
      limit: req.query.limit
    });
    res.json(alerts);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const manageQuarantinedFile = async (req, res) => {
  try {
    const result = await manageQuarantinedFileService(
      req.user,
      req.params.fileId,
      req.body.action,
      {
        reason: req.body.reason,
        notes: req.body.notes
      }
    );
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const getAIStatisticsController = async (req, res) => {
  try {
    const tenantId = req.query.tenantId || req.user?.tenantId;
    const stats = await getAIStatistics(tenantId);
    res.json({ statistics: stats, circuit: null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getAILogsController = async (req, res) => {
  try {
    const filters = {
      tenantId: req.query.tenantId || req.user?.tenantId,
      module: req.query.module,
      success: req.query.success !== undefined ? req.query.success === 'true' : undefined,
      dateFrom: req.query.dateFrom ? new Date(req.query.dateFrom) : undefined,
      dateTo: req.query.dateTo ? new Date(req.query.dateTo) : undefined,
      limit: Number(req.query.limit) || 100
    };

    const logs = await getAIAnalysisLogs(filters);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getAICircuitController = async (req, res) => {
  try {
    const status = circuitBreaker.getStatus();
    res.json({ circuit: status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const postAICircuitResetController = async (req, res) => {
  try {
    circuitBreaker.reset();
    res.json({ success: true, message: 'circuit_reset' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

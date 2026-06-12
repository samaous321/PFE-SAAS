import * as userService from "../services/user.service.js";
import * as aiOllamaService from "../services/ai-ollama.service.js";
import { validateAccessAnomalyResponse } from "../utils/ai-validators.js";
import { logAIAnalysis } from "../utils/ai-logging.js";
import User from "../models/User.js";
import activityService from "../services/activity.service.js";

/* =========================
   Register
========================= */
export const createUser = async (req, res) => {
  try {
    console.log('🔵 [API] POST /users/register - Requête reçue');
    console.log('📋 [API] Payload:', req.body);
    
    const user = await userService.createUser(req.body);
    
    console.log('✅ [API] User créé avec succès:', user._id);
    res.status(201).json(user);
  } catch (error) {
    console.error('❌ [API] Erreur lors de la création:', error.message);
    console.error('📝 [API] Stack:', error.stack);
    res.status(400).json({ error: error.message });
  }
};

export const createUserAsAdmin = async (req, res) => {
  try {
    const user = await userService.createUser(req.body, req.user);
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

/* =========================
   Login
========================= */
export const signIn = async (req, res) => {
  try {
    const result = await userService.signIn(
      req.body.email,
      req.body.password
    );
    res.json(result);

    // Activity log: login
    try {
      await activityService.logActivity({
        userId: result.userId,
        tenantId: result.tenantId || null,
        type: 'auth',
        action: 'login',
        resourceId: result.userId,
        resourceType: 'user',
        metadata: { ip: req.ip },
        ip: req.ip,
        userAgent: req.get('User-Agent') || null
      });
    } catch (e) {
      console.warn('[Activity] failed to log login:', e.message);
    }

    // ASYNC: analyze access patterns without blocking login response
    setImmediate(async () => {
      try {
        const userId = result.userId;
        if (!userId) return;
        const tenantId = result.tenantId || null;

        void logAIAnalysis({
          userId,
          tenantId,
          module: 'login',
          operation: 'detectAccessAnomalies',
          model: process.env.OLLAMA_MODEL,
          result: { status: 'queued', message: 'login anomaly analysis scheduled' },
          rawResponse: '',
          success: true,
          duration: 0
        }).catch(() => {});

        const userDoc = tenantId ? null : await User.findById(userId).select('tenantId').lean();
        const resolvedTenantId = tenantId || userDoc?.tenantId || null;

        // Attempt to load SecurityAudit model if present
        let accessHistory = [];
        try {
          // Dynamic import to avoid hard dependency
          // eslint-disable-next-line node/no-unsupported-features/es-syntax
          const SecurityAudit = (await import('../models/SecurityAudit.js')).default;
          accessHistory = await SecurityAudit.find({ userId, eventType: 'LOGIN_SUCCESSFUL' }).sort({ timestamp: -1 }).limit(20).lean();
        } catch (e) {
          // No security audit model; fallback to empty history
          accessHistory = [];
        }

          const aiResponse = await aiOllamaService.detectAccessAnomalies(userId, accessHistory, { tenantId: resolvedTenantId });
        const validation = validateAccessAnomalyResponse(aiResponse?.response || aiResponse || '');
        const anomalyResult = validation.data;

        if (!aiResponse?._alreadyLogged) {
          const aiLog = {
            userId,
            tenantId: resolvedTenantId,
            module: 'login',
            operation: 'detectAccessAnomalies',
            model: process.env.OLLAMA_MODEL,
            result: anomalyResult,
            rawResponse: aiResponse?.response || null,
            success: validation.valid,
            duration: 0
          };
          void logAIAnalysis(aiLog).catch(() => {});
        }

        if (anomalyResult.anomalies_detected && anomalyResult.confidence > (Number(process.env.AI_ANOMALY_CONFIDENCE_THRESHOLD) || 70)) {
          console.warn(`[Login AI] Anomaly detected for user ${userId}: ${anomalyResult.issues.join(', ')}`);

          // Require enhanced 2FA for this user
          try {
            await User.findByIdAndUpdate(userId, { $set: { 'securityFlags.requireEnhanced2FA': true, 'securityFlags.lastAnomalyDetected': new Date(), 'securityFlags.anomalyReason': anomalyResult.issues.join('; ') } });
          } catch (uerr) {
            console.warn('[Login AI] Failed to update user security flags:', uerr.message);
          }
        }
      } catch (aiErr) {
        console.warn('[Login AI] Async anomaly detection failed:', aiErr.message);
      }
    });
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
};

/* =========================
   Verify user
========================= */
export const verifyUser = async (req, res) => {
  try {
    await userService.verifyUser(
      req.params.userId,
      req.params.verificationCode
    );
    res.json({ message: "User verified successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

/* =========================
   Verify user by email + code
========================= */
export const verifyUserByEmail = async (req, res) => {
  try {
    await userService.verifyUserByEmail(
      req.body.email,
      req.body.verificationCode
    );
    res.json({ message: "User verified successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

/* =========================
   Send verification code
========================= */
export const sendVerificationCode = async (req, res) => {
  try {
    await userService.sendVerificationCode(req.body.email);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

/* =========================
   CRUD
========================= */
export const getUsers = async (req, res) => {
  try {
    const hasPagination = req.query.page || req.query.limit;

    if (hasPagination) {
      const response = await userService.getUsersPaginated(req.user, {
        page: req.query.page,
        limit: req.query.limit
      });

      return res.json(response);
    }

    const users = await userService.getUsers(req.user);
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getUsersByTenant = async (req, res) => {
  try {
    const users = await userService.getUsersByTenant(req.params.tenantId, req.user);
    res.json(users);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const searchUsers = async (req, res) => {
  try {
    const users = await userService.searchUsers(req.query.q, req.user);
    res.json(users);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const getUserById = async (req, res) => {
  try {
    const user = await userService.getUserById(req.params.id, req.user);
    res.json(user);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
};

export const updateUser = async (req, res) => {
  try {
    const user = await userService.updateUser(
      req.params.id,
      req.body,
      req.user
    );
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const deleteUser = async (req, res) => {
  try {
    await userService.deleteUser(req.params.id, req.user);
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
};

/* =========================
   Get User Stats
========================= */
export const getUserStats = async (req, res) => {
  try {
    // Extract filter parameters from query
    const filters = {};

    if (req.query.startDate) {
      const startDate = new Date(req.query.startDate);
      if (!isNaN(startDate.getTime())) {
        filters.startDate = req.query.startDate;
      }
    }

    if (req.query.endDate) {
      const endDate = new Date(req.query.endDate);
      if (!isNaN(endDate.getTime())) {
        filters.endDate = req.query.endDate;
      }
    }

    if (req.query.fileType) {
      filters.fileType = req.query.fileType;
    }

    if (req.query.status && ['active', 'expired', 'blocked'].includes(req.query.status)) {
      filters.status = req.query.status;
    }

    // Import stats service dynamically to avoid circular dependencies
    const statsService = (await import("../services/stats.service.js")).default;

    const stats = await statsService.getUserStats(req.user.userId, req.user.tenantId, filters);
    res.json(stats);
  } catch (error) {
    console.error('Error getting user stats:', error);
    res.status(400).json({ error: error.message });
  }
};

export const getUserQuota = async (req, res) => {
  try {
    const quota = await userService.getUserQuotaSummary(req.user);
    res.json(quota);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const getUserQuotaById = async (req, res) => {
  try {
    const quota = await userService.getUserQuotaSummaryById(req.params.id, req.user);
    res.json(quota);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

/* =========================
   USER logout
========================= */

export const logout = async (req, res) => {
  try {
    await userService.logout(req.user.userId);
    // Activity log: logout
    try {
      await activityService.logActivity({
        userId: req.user.userId,
        tenantId: req.user.tenantId || null,
        type: 'auth',
        action: 'logout',
        resourceId: req.user.userId,
        resourceType: 'user',
        metadata: {},
        ip: req.ip,
        userAgent: req.get('User-Agent') || null
      });
    } catch (e) {
      console.warn('[Activity] failed to log logout:', e.message);
    }

    res.json({ message: "Logged out successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

/* =========================
   2FA OTP Verification
========================= */

/**
 * POST /users/auth/verify-otp
 * Verify OTP and generate JWT token
 */
export const verifyOTP = async (req, res) => {
  try {
    const { userId, otp } = req.body;

    if (!userId || !otp) {
      return res.status(400).json({ error: 'userId and otp are required' });
    }

    const result = await userService.verify2FAOTP(userId, otp);
    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
};

/**
 * POST /users/auth/resend-otp
 * Resend OTP code
 */
export const resendOTP = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const result = await userService.resendOTP(userId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

/**
 * POST /users/:id/2fa/enable
 * Enable 2FA for a user
 */
export const enable2FA = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    const userId = req.params.id;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'phoneNumber is required' });
    }

    const result = await userService.enable2FA(userId, phoneNumber, req.user);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

/**
 * POST /users/:id/2fa/disable
 * Disable 2FA for a user
 */
export const disable2FA = async (req, res) => {
  try {
    const userId = req.params.id;

    const result = await userService.disable2FA(userId, req.user);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

/**
 * GET /users/:id/2fa/status
 * Get 2FA status for a user
 */
export const get2FAStatus = async (req, res) => {
  try {
    const userId = req.params.id;

    const result = await userService.get2FAStatus(userId, req.user);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

import express from "express";

import {
  signIn,
  createUser,
  createUserAsAdmin,
  deleteUser,
  getUserById,
   getUsersByTenant,
  getUsers,
   searchUsers,
  updateUser,
  verifyUser,
   verifyUserByEmail,
  sendVerificationCode,
  logout,
   getUserStats,
   getUserQuota,
   getUserQuotaById,
   verifyOTP,
   resendOTP,
   enable2FA,
   disable2FA,
   get2FAStatus
} from "../controllers/user.controller.js";

import { authenticateToken, requireRole } from "../middlewares/auth.middleware.js";
import { authLimiter, otpVerifyLimiter, otpResendLimiter, twoFAConfigLimiter } from "../middlewares/rate-limit.middleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

/* =========================
   AUTH
========================= */
router.post("/register", authLimiter, createUser);
router.post("/signin", authLimiter, signIn);

/* =========================
   2FA OTP
========================= */
router.post("/auth/verify-otp", otpVerifyLimiter, verifyOTP);
router.post("/auth/resend-otp", otpResendLimiter, resendOTP);

/* =========================
   EMAIL VERIFICATION
========================= */
router.get("/verify/:userId/:verificationCode", verifyUser);
router.post("/verify-code", verifyUserByEmail);
router.post("/send-verification-code", sendVerificationCode);

/* =========================
   USERS CRUD
========================= */
router.post("/", authenticateToken, requireRole(ROLES.SUPERADMIN, ROLES.TENANT_ADMIN), createUserAsAdmin);
router.get("/", authenticateToken, getUsers);
router.get("/search", authenticateToken, searchUsers);
router.get("/tenant/:tenantId", authenticateToken, requireRole(ROLES.SUPERADMIN, ROLES.TENANT_ADMIN), getUsersByTenant);
router.get("/stats", authenticateToken, getUserStats);
router.get("/quota", authenticateToken, getUserQuota);
router.get("/:id/quota", authenticateToken, requireRole(ROLES.SUPERADMIN, ROLES.TENANT_ADMIN), getUserQuotaById);
router.get("/:id", authenticateToken, getUserById);
router.put("/:id", authenticateToken, updateUser);
router.delete("/:id", authenticateToken, deleteUser);

/* =========================
   2FA Configuration
========================= */
router.post("/:id/2fa/enable", authenticateToken, twoFAConfigLimiter, enable2FA);
router.post("/:id/2fa/disable", authenticateToken, twoFAConfigLimiter, disable2FA);
router.get("/:id/2fa/status", authenticateToken, get2FAStatus);

/* =========================
   USERS logout
========================= */
router.post("/logout", authenticateToken, logout);

export default router;

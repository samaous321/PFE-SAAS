import User from "../models/User.js";
import Tenant from "../models/Tenant.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import mongoose from "mongoose";
import { assertTenantUserWithinQuota, getEffectiveQuotaPolicy } from "./quota.service.js";
import { ROLES, isSuperAdmin, isTenantAdmin, isAnyAdmin } from "../constants/roles.js";

const SALT = 10;

/**
 * Check if user is SUPERADMIN
 */
const isSuperAdminUser = (requester) => requester?.role === ROLES.SUPERADMIN;

/**
 * Check if user is any type of admin (SUPERADMIN or TENANT_ADMIN)
 */
const isAnyAdminUser = (requester) => {
  return requester?.role === ROLES.SUPERADMIN || requester?.role === ROLES.TENANT_ADMIN;
};

const validateTenantId = async (tenantId) => {
  if (!mongoose.Types.ObjectId.isValid(tenantId)) {
    throw new Error("Invalid tenantId");
  }

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new Error("Tenant not found");

  return tenant._id;
};

const getDefaultTenantId = async () => {
  let defaultTenant = await Tenant.findOne({
    status: "active",
    $or: [{ domain: "default" }, { name: "default" }],
  });

  if (!defaultTenant) {
    defaultTenant = await Tenant.findOne({ status: "active" }).sort({ createdAt: 1 });
  }

  if (!defaultTenant) {
    throw new Error("Aucun tenant actif trouvé. Veuillez spécifier un tenantId.");
  }

  return defaultTenant._id;
};

const assertUserAccess = (user, requester) => {
  // SUPERADMIN can access any user
  if (isSuperAdminUser(requester)) return;

  // TENANT_ADMIN/USER cannot access SUPERADMIN users, even if tenant IDs match
  if (user.role === ROLES.SUPERADMIN) {
    throw new Error("Access denied");
  }

  // TENANT_ADMIN/USER can only access users from their same tenant
  if (!requester?.tenantId || !user?.tenantId) {
    throw new Error("Invalid tenant context");
  }

  if (user.tenantId.toString() !== requester.tenantId.toString()) {
    throw new Error("Access denied");
  }
};

/* =========================
   Generate a random 6-digit code
========================= */
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000);
};

/* =========================
   Send email with verification code
========================= */
export const sendEmail = async (email, verificationCode) => {
  const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Verification Code",
    text: `Your verification code is: ${verificationCode}`,
  };

  await transporter.sendMail(mailOptions);
};

/* =========================
   Sign Up
========================= */
export const createUser = async (userData, requester = null) => {
  const {
    firstName,
    lastName,
    email,
    phoneNumber,
    password,
    tenantId,
    tenantDomain,
    storagePlan,
    role
  } = userData;

  // Normalize and validate role
  let normalizedRole = role;
  if (role && !Object.values(ROLES).includes(role)) {
    // Fallback: map old "admin" to ROLES.SUPERADMIN for backward compatibility
    normalizedRole = role === "admin" ? ROLES.SUPERADMIN : ROLES.USER;
  } else if (!role) {
    normalizedRole = ROLES.USER;
  }

  // Only SUPERADMIN can create SUPERADMIN users
  if (normalizedRole === ROLES.SUPERADMIN && !isSuperAdminUser(requester)) {
    throw new Error("Only a SUPERADMIN can create SUPERADMIN users");
  }

  // Only SUPERADMIN or TENANT_ADMIN can create TENANT_ADMIN users
  if (normalizedRole === ROLES.TENANT_ADMIN && !isAnyAdminUser(requester)) {
    throw new Error("Only an admin can create TENANT_ADMIN users");
  }

  let normalizedTenantId = null;
  let tenantWasCreated = false;
  
  if (tenantId) {
    normalizedTenantId = await validateTenantId(tenantId);
  } else if (tenantDomain) {
    // Check if tenant with this domain exists
    const existingTenant = await Tenant.findOne({ domain: tenantDomain.toLowerCase() });
    if (existingTenant) {
      normalizedTenantId = existingTenant._id;
    } else {
      // Create new tenant with the specified domain and storage plan
      const newTenant = await Tenant.create({
        name: tenantDomain,
        domain: tenantDomain.toLowerCase(),
        subscriptionPlan: storagePlan || 'standard',
        status: 'active',
        owner: userData.email
      });
      normalizedTenantId = newTenant._id;
      tenantWasCreated = true;
      // If tenant was just created, user should be assigned as admin
      normalizedRole = ROLES.TENANT_ADMIN;
    }
  }

  // Tenant admins may only create users in their own tenant
  const requesterIsTenantAdmin = requester?.role === ROLES.TENANT_ADMIN;
  if (requesterIsTenantAdmin) {
    if (!requester.tenantId) {
      throw new Error("Invalid tenant context");
    }

    const requesterTenantId = await validateTenantId(requester.tenantId);
    if (normalizedTenantId && normalizedTenantId.toString() !== requesterTenantId.toString()) {
      throw new Error("Tenant admins can only create users in their own tenant");
    }

    normalizedTenantId = requesterTenantId;
  }

  if (!normalizedTenantId && normalizedRole !== ROLES.SUPERADMIN) {
    // Non-SUPERADMIN users must have a tenant
    if (requester?.tenantId) {
      normalizedTenantId = await validateTenantId(requester.tenantId);
    } else {
      normalizedTenantId = await getDefaultTenantId();
    }
  }

  const existingUser = await User.findOne({ email: userData.email });
  if (existingUser) throw new Error("User already exists");

  if (normalizedTenantId && normalizedRole !== ROLES.SUPERADMIN) {
    await assertTenantUserWithinQuota({
      tenantId: normalizedTenantId,
      userId: requester?.userId || requester?._id || null,
      increment: 1
    });
  }

  const hashedPassword = await bcrypt.hash(password, SALT);

  const verificationCode = generateVerificationCode();

  const user = await User.create({
    tenantId: normalizedTenantId,
    firstName,
    lastName,
    email,
    phoneNumber,
    password: hashedPassword,
    role: normalizedRole,
    status: "active",
    verificationCode,
    verified: false,
    metadata: {
      tenantDomain,
      tenantWasCreated,
      storagePlan
    }
  });

  try {
    await sendEmail(user.email, verificationCode);
  } catch (error) {
    console.warn('Email notification failed:', error);
  }

  return user;
};

/* =========================
   Sign In
========================= */
export const signIn = async (email, password) => {
  const user = await User.findOne({ email }).select("+password");

  if (!user) throw new Error("User not found");
  if (!user.verified) throw new Error("User not verified");
  if (!user.password) throw new Error("Authentication failed");

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new Error("Authentication failed");

  // If 2FA is enabled, initiate 2FA flow
  if (user.is2FAEnabled) {
    // Import OTP service
    const { initiate2FA } = await import('./otp.service.js');
    
    try {
      await initiate2FA(user._id);
      
      // Return response indicating 2FA is required
      return {
        requires2FA: true,
        userId: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        message: "OTP sent to your phone number"
      };
    } catch (error) {
      console.error('Failed to initiate 2FA:', error);
      throw new Error('Failed to send OTP. Please try again later.');
    }
  }

  // Non-SUPERADMIN users must have a tenantId
  if (user.role !== ROLES.SUPERADMIN && !user.tenantId) {
    user.tenantId = await getDefaultTenantId();
  }

  const token = jwt.sign(
    { userId: user._id, tenantId: user.tenantId, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  user.token = token;
  user.lastLogin = new Date();
  await user.save();

  // Fetch tenant name if user has a tenantId
  let tenantName = undefined;
  if (user.tenantId) {
    const tenant = await Tenant.findById(user.tenantId);
    tenantName = tenant?.name || undefined;
  }

  return {
    requires2FA: false,
    userId: user._id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    tenantId: user.tenantId,
    tenantName,
    role: user.role,
    token,
  };
};

/* =========================
   Verify user by code
========================= */
export const verifyUser = async (userId, verificationCode) => {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  if (verificationCode != user.verificationCode)
    throw new Error("Invalid verification code");

  user.verified = true;
  user.verificationCode = null;

  await user.save();

  return true;
};

/* =========================
   Verify user by email + code
========================= */
export const verifyUserByEmail = async (email, verificationCode) => {
  const user = await User.findOne({ email });
  if (!user) throw new Error("User not found");

  if (verificationCode != user.verificationCode) {
    throw new Error("Invalid verification code");
  }

  user.verified = true;
  user.verificationCode = null;

  await user.save();

  return true;
};

/* =========================
   Send verification code
========================= */
export const sendVerificationCode = async (email) => {
  const user = await User.findOne({ email});
  if (!user) throw new Error("User not found");

  const verificationCode = generateVerificationCode();

  user.verificationCode = verificationCode;
  await user.save();

  await sendEmail(email, verificationCode);

  return true;
};

/* =========================
   Get Users
========================= */
export const getUsers = async (requester) => {
  // SUPERADMIN can see all users
  if (isSuperAdminUser(requester)) {
    return await User.find().sort({ createdAt: -1 });
  }

  // TENANT_ADMIN and USER can only see users from their tenant and never SUPERADMIN users
  if (!requester?.tenantId) throw new Error("Invalid tenant context");

  return await User.find({
    tenantId: requester.tenantId,
    role: { $ne: ROLES.SUPERADMIN }
  }).sort({ createdAt: -1 });
};

export const getUsersPaginated = async (requester, options = {}) => {
  const page = Math.max(Number(options.page) || 1, 1);
  const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;

  const filters = {};
  if (!isSuperAdminUser(requester)) {
    // TENANT_ADMIN and USER can only see users from their tenant and never SUPERADMIN users
    if (!requester?.tenantId) {
      throw new Error("Invalid tenant context");
    }

    filters.tenantId = requester.tenantId;
    filters.role = { $ne: ROLES.SUPERADMIN };
  }

  const [items, total] = await Promise.all([
    User.find(filters).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filters)
  ]);

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
};

export const getUsersByTenant = async (tenantId, requester) => {
  // Only SUPERADMIN can query users by tenant ID
  if (!isSuperAdminUser(requester)) {
    throw new Error("Access denied");
  }

  if (!mongoose.Types.ObjectId.isValid(tenantId)) {
    throw new Error("Invalid tenantId");
  }

  return await User.find({ tenantId }).sort({ createdAt: -1 });
};

export const searchUsers = async (query, requester) => {
  const search = String(query || "").trim();
  if (!search) {
    return [];
  }

  const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const filters = {
    $or: [
      { email: regex },
      { firstName: regex },
      { lastName: regex }
    ]
  };

  if (!isSuperAdminUser(requester)) {
    // TENANT_ADMIN and USER can only search within their tenant and never SUPERADMIN users
    if (!requester?.tenantId) {
      throw new Error("Invalid tenant context");
    }

    filters.tenantId = requester.tenantId;
    filters.role = { $ne: ROLES.SUPERADMIN };
  }

  return await User.find(filters).sort({ createdAt: -1 }).limit(50);
};

export const getUserById = async (id, requester) => {
  const user = await User.findById(id);
  if (!user) throw new Error("User not found");

  assertUserAccess(user, requester);

  return user;
};

/* =========================
   Update User
========================= */
export const updateUser = async (id, updatedData, requester) => {
  const currentUser = await User.findById(id);
  if (!currentUser) throw new Error("User not found");

  const requesterIsSuperAdmin = isSuperAdminUser(requester);
  assertUserAccess(currentUser, requester);

  const safeData = { ...updatedData };
  delete safeData.role;
  delete safeData.status;
  delete safeData.verified;

  if (!requesterIsSuperAdmin) {
    delete safeData.tenantId;
  } else if (Object.prototype.hasOwnProperty.call(updatedData, "tenantId")) {
    if (!updatedData.tenantId) {
      // Only SUPERADMIN can have no tenant
      if (currentUser.role === ROLES.SUPERADMIN) {
        safeData.tenantId = null;
      } else {
        safeData.tenantId = await getDefaultTenantId();
      }
    } else {
      safeData.tenantId = await validateTenantId(updatedData.tenantId);
    }
  }

  if (updatedData.password) {
    safeData.password = await bcrypt.hash(
      safeData.password,
      SALT
    );
  } else {
    delete safeData.password;
  }

  const user = await User.findByIdAndUpdate(id, safeData, {
    returnDocument: "after",
    runValidators: true,
  });

  if (!user) throw new Error("User not found");

  return user;
};

/* =========================
   Delete User
========================= */
export const deleteUser = async (id, requester) => {
  const user = await User.findById(id);
  if (!user) throw new Error("User not found");

  assertUserAccess(user, requester);

  await User.findByIdAndDelete(id);

  return true;
};

/* =========================
    User logout 
========================= */
export const logout = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  user.token = null;
  await user.save();

  return true;
};

/* =========================
   Get User Stats
========================= */
export const getUserStats = async (requester) => {
  if (!requester?.userId) {
    throw new Error("Invalid user context");
  }

  const userId = requester.userId;
  const tenantId = requester.tenantId;

  // Import stats service dynamically to avoid circular dependencies
  const statsService = (await import("./stats.service.js")).default;

  // Get comprehensive stats
  const comprehensiveStats = await statsService.getUserStats(userId, tenantId);

  // For backward compatibility, also provide the old flat structure
  const legacyStats = {
    totalFiles: comprehensiveStats.fileManagement.uploads,
    totalSize: comprehensiveStats.fileManagement.totalSize,
    storageLimit: 0, // Will be calculated below
    quotaPlan: 'default',
    quotaScope: 'tenant',
    sharedFiles: comprehensiveStats.sharing.filesShared,
    receivedFiles: comprehensiveStats.sharing.filesReceived,
    recentUploads: 0, // Will be calculated below
    storageUsedPercent: null,
    lastActivity: comprehensiveStats.activity.lastLogin
  };

  // Get additional legacy data
  const File = (await import("../models/File.js")).default;
  const SharedLink = (await import("../models/SharedLink.js")).default;
  const Tenant = (await import("../models/Tenant.js")).default;

  const userObjectId = new mongoose.Types.ObjectId(userId);
  const tenantObjectId = new mongoose.Types.ObjectId(tenantId);

  // Recent uploads (last 7 days) for legacy compatibility
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  legacyStats.recentUploads = await File.countDocuments({
    ownerId: userObjectId,
    tenantId: tenantObjectId,
    createdAt: { $gte: sevenDaysAgo }
  });

  // Storage limit calculation for legacy compatibility
  const tenant = await Tenant.findById(tenantId);
  const { getEffectiveQuotaPolicy } = await import("./quota.service.js");
  const quotaPolicy = getEffectiveQuotaPolicy(tenant);
  legacyStats.storageLimit = quotaPolicy.user.storageBytes || quotaPolicy.tenant.storageBytes || 0;
  legacyStats.quotaPlan = quotaPolicy.plan;
  legacyStats.quotaScope = quotaPolicy.user.storageBytes ? "user" : "tenant";

  const usedStorage = comprehensiveStats.fileManagement.totalSize;
  legacyStats.storageUsedPercent = legacyStats.storageLimit > 0 ? Math.min((usedStorage / legacyStats.storageLimit) * 100, 100) : null;

  // Return both comprehensive and legacy formats
  return {
    ...legacyStats,
    comprehensive: comprehensiveStats
  };
};

const buildUserQuotaSummary = async (user) => {
  if (!user?.tenantId || !user?._id) {
    throw new Error("Invalid tenant context");
  }

  const tenant = await Tenant.findById(user.tenantId);
  if (!tenant) {
    throw new Error("Tenant not found");
  }

  const quotaPolicy = getEffectiveQuotaPolicy(tenant);
  const userObjectId = new mongoose.Types.ObjectId(user._id);
  const tenantObjectId = new mongoose.Types.ObjectId(user.tenantId);

  const [tenantUsage, userUsage, filesCount, foldersCount, usersCount] = await Promise.all([
    File.aggregate([
      { $match: { tenantId: tenantObjectId } },
      { $group: { _id: null, storageBytes: { $sum: { $ifNull: ["$size", 0] } }, fileCount: { $sum: 1 } } }
    ]),
    File.aggregate([
      { $match: { tenantId: tenantObjectId, ownerId: userObjectId } },
      { $group: { _id: null, storageBytes: { $sum: { $ifNull: ["$size", 0] } }, fileCount: { $sum: 1 } } }
    ]),
    File.countDocuments({ tenantId: tenantObjectId, ownerId: userObjectId }),
    (await import("../models/Folder.js")).default.countDocuments({ tenantId: tenantObjectId, ownerId: userObjectId }),
    User.countDocuments({ tenantId: tenantObjectId })
  ]);

  const tenantStorageUsed = tenantUsage?.[0]?.storageBytes || 0;
  const userStorageUsed = userUsage?.[0]?.storageBytes || 0;
  const activeStorageLimit = quotaPolicy.user.storageBytes || quotaPolicy.tenant.storageBytes || 0;

  return {
    plan: quotaPolicy.plan,
    scope: quotaPolicy.user.storageBytes ? "user" : "tenant",
    tenant: {
      id: tenant._id.toString(),
      name: tenant.name,
      storageUsedBytes: tenantStorageUsed,
      storageLimitBytes: quotaPolicy.tenant.storageBytes,
      storageUsedPercent: quotaPolicy.tenant.storageBytes ? Math.min((tenantStorageUsed / quotaPolicy.tenant.storageBytes) * 100, 100) : null,
      maxUsers: quotaPolicy.tenant.maxUsers,
      maxFiles: quotaPolicy.tenant.maxFiles,
      maxFolders: quotaPolicy.tenant.maxFolders,
      usersCount,
      foldersCount
    },
    user: {
      id: user._id.toString(),
      storageUsedBytes: userStorageUsed,
      storageLimitBytes: activeStorageLimit,
      storageUsedPercent: activeStorageLimit ? Math.min((userStorageUsed / activeStorageLimit) * 100, 100) : null,
      maxFiles: quotaPolicy.user.maxFiles,
      maxDailyUploadBytes: quotaPolicy.user.maxDailyUploadBytes,
      filesCount
    }
  };
};

export const getUserQuotaSummary = async (requester) => {
  if (!requester?.tenantId || !requester?.userId) {
    throw new Error("Invalid tenant context");
  }

  const user = await User.findById(requester.userId);
  if (!user) {
    throw new Error("User not found");
  }

  return buildUserQuotaSummary(user);
};

export const getUserQuotaSummaryById = async (userId, requester) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID");
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  assertUserAccess(user, requester);
  return buildUserQuotaSummary(user);
};

/* =========================
   2FA Management
========================= */

/**
 * Verify 2FA OTP
 */
export const verify2FAOTP = async (userId, otp) => {
  try {
    const { verify2FAOTP } = await import('./otp.service.js');
    const result = await verify2FAOTP(userId, otp);

    // After successful OTP verification, generate JWT
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    // Non-SUPERADMIN users must have a tenantId
    if (user.role !== ROLES.SUPERADMIN && !user.tenantId) {
      user.tenantId = await getDefaultTenantId();
    }

    const token = jwt.sign(
      { userId: user._id, tenantId: user.tenantId, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    user.token = token;
    user.lastLogin = new Date();
    await user.save();

    // Fetch tenant name if user has a tenantId
    let tenantName = undefined;
    if (user.tenantId) {
      const tenant = await Tenant.findById(user.tenantId);
      tenantName = tenant?.name || undefined;
    }

    return {
      success: true,
      message: '2FA verification successful',
      userId: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      tenantId: user.tenantId,
      tenantName,
      role: user.role,
      token
    };
  } catch (error) {
    console.error('Error verifying 2FA OTP:', error);
    throw error;
  }
};

/**
 * Enable 2FA for a user
 */
export const enable2FA = async (userId, phoneNumber, requester) => {
  try {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    // User can only enable 2FA for themselves, or admin can enable for others
    if (user._id.toString() !== requester.userId.toString() && !isAnyAdminUser(requester)) {
      throw new Error('Unauthorized to enable 2FA for this user');
    }

    const { enable2FA } = await import('./otp.service.js');
    return await enable2FA(userId, phoneNumber);
  } catch (error) {
    console.error('Error enabling 2FA:', error);
    throw error;
  }
};

/**
 * Disable 2FA for a user
 */
export const disable2FA = async (userId, requester) => {
  try {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    // User can only disable 2FA for themselves, or admin can disable for others
    if (user._id.toString() !== requester.userId.toString() && !isAnyAdminUser(requester)) {
      throw new Error('Unauthorized to disable 2FA for this user');
    }

    const { disable2FA } = await import('./otp.service.js');
    return await disable2FA(userId);
  } catch (error) {
    console.error('Error disabling 2FA:', error);
    throw error;
  }
};

/**
 * Resend OTP
 */
export const resendOTP = async (userId) => {
  try {
    const { resendOTP } = await import('./otp.service.js');
    return await resendOTP(userId);
  } catch (error) {
    console.error('Error resending OTP:', error);
    throw error;
  }
};

/**
 * Get 2FA status for a user
 */
export const get2FAStatus = async (userId, requester) => {
  try {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    // User can only view their own 2FA status, or admin can view for others
    if (user._id.toString() !== requester.userId.toString() && !isAnyAdminUser(requester)) {
      throw new Error('Unauthorized to view 2FA status for this user');
    }

    return {
      userId: user._id,
      is2FAEnabled: user.is2FAEnabled,
      phoneNumber: user.phoneNumber ? user.phoneNumber.replace(/\d(?=\d{2}$)/g, '*') : null, // Mask phone number
      hasPendingOTP: user.otpCode && user.otpExpires && new Date() < user.otpExpires,
      otpAttemptsRemaining: Math.max(0, 5 - user.otpAttempts),
      isOTPBlocked: user.otpBlocked && user.otpBlockedUntil > new Date()
    };
  } catch (error) {
    console.error('Error getting 2FA status:', error);
    throw error;
  }
};

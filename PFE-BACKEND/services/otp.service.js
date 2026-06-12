import bcrypt from 'bcrypt';
import crypto from 'crypto';
import User from '../models/User.js';

const SALT = 10;
const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 5;
const MAX_OTP_ATTEMPTS = 5;
const BLOCK_DURATION_MINUTES = 15;

/**
 * Generate a random 6-digit OTP
 */
export const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
};

/**
 * Hash OTP using bcrypt
 */
export const hashOTP = async (otp) => {
  return await bcrypt.hash(otp, SALT);
};

/**
 * Verify OTP against hashed value
 */
export const verifyOTP = async (plainOTP, hashedOTP) => {
  return await bcrypt.compare(plainOTP, hashedOTP);
};

/**
 * Send OTP to user (calls Twilio service)
 * This is imported from twilio.service.js
 */
export const sendOTPViaSMS = async (userId, otp) => {
  try {
    const user = await User.findById(userId).select('+otpCode');
    if (!user || !user.phoneNumber) {
      throw new Error('User phone number not found');
    }

    // Import Twilio service dynamically
    const { sendSMS } = await import('./twilio.service.js');
    await sendSMS(user.phoneNumber, otp);

    return true;
  } catch (error) {
    console.error('Failed to send OTP via SMS:', error);
    throw error;
  }
};

/**
 * Initialize 2FA and send OTP
 * Called after successful email/password authentication
 */
export const initiate2FA = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    // Check if user is blocked
    if (user.otpBlocked && user.otpBlockedUntil > new Date()) {
      throw new Error('OTP attempts temporarily blocked. Please try again later.');
    }

    // Generate and hash OTP
    const plainOTP = generateOTP();
    const hashedOTP = await hashOTP(plainOTP);

    // Set expiration time (5 minutes from now)
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Reset attempts if not blocked
    const update = {
      otpCode: hashedOTP,
      otpExpires: expiresAt,
      otpAttempts: 0,
      otpBlocked: false,
      otpBlockedUntil: null
    };

    await User.findByIdAndUpdate(userId, update, { new: true });

    // Send OTP via SMS
    await sendOTPViaSMS(userId, plainOTP);

    return {
      success: true,
      message: 'OTP sent to phone number',
      expiresIn: OTP_EXPIRY_MINUTES * 60 // in seconds
    };
  } catch (error) {
    console.error('Error initiating 2FA:', error);
    throw error;
  }
};

/**
 * Verify OTP code
 */
export const verify2FAOTP = async (userId, plainOTP) => {
  try {
    const user = await User.findById(userId).select('+otpCode');
    if (!user) throw new Error('User not found');

    // Check if OTP is blocked
    if (user.otpBlocked && user.otpBlockedUntil > new Date()) {
      throw new Error('Too many failed attempts. Please try again later.');
    }

    // Check if OTP has expired
    if (!user.otpCode || !user.otpExpires || new Date() > user.otpExpires) {
      throw new Error('OTP has expired. Please request a new one.');
    }

    // Verify OTP
    const isValid = await verifyOTP(plainOTP, user.otpCode);

    if (!isValid) {
      // Increment attempt counter
      const newAttempts = user.otpAttempts + 1;
      const update = { otpAttempts: newAttempts };

      // Block user after 5 failed attempts
      if (newAttempts >= MAX_OTP_ATTEMPTS) {
        update.otpBlocked = true;
        update.otpBlockedUntil = new Date(Date.now() + BLOCK_DURATION_MINUTES * 60 * 1000);
      }

      await User.findByIdAndUpdate(userId, update);
      throw new Error('Invalid OTP code');
    }

    // Clear OTP fields on successful verification
    await User.findByIdAndUpdate(userId, {
      otpCode: null,
      otpExpires: null,
      otpAttempts: 0,
      otpBlocked: false,
      otpBlockedUntil: null
    });

    return {
      success: true,
      message: '2FA verification successful'
    };
  } catch (error) {
    console.error('Error verifying 2FA OTP:', error);
    throw error;
  }
};

/**
 * Clear OTP data for a user
 */
export const clearOTPData = async (userId) => {
  try {
    await User.findByIdAndUpdate(userId, {
      otpCode: null,
      otpExpires: null,
      otpAttempts: 0,
      otpBlocked: false,
      otpBlockedUntil: null
    });
    return true;
  } catch (error) {
    console.error('Error clearing OTP data:', error);
    throw error;
  }
};

/**
 * Enable 2FA for a user
 */
export const enable2FA = async (userId, phoneNumber) => {
  try {
    // Validate phone number format
    if (!phoneNumber || !phoneNumber.startsWith('+216')) {
      throw new Error('Invalid Tunisian phone number. Must start with +216');
    }

    const user = await User.findByIdAndUpdate(
      userId,
      {
        is2FAEnabled: true,
        phoneNumber: phoneNumber
      },
      { new: true }
    );

    return {
      success: true,
      message: '2FA enabled successfully',
      user
    };
  } catch (error) {
    console.error('Error enabling 2FA:', error);
    throw error;
  }
};

/**
 * Disable 2FA for a user
 */
export const disable2FA = async (userId) => {
  try {
    await User.findByIdAndUpdate(userId, {
      is2FAEnabled: false,
      otpCode: null,
      otpExpires: null,
      otpAttempts: 0,
      otpBlocked: false,
      otpBlockedUntil: null
    });

    return {
      success: true,
      message: '2FA disabled successfully'
    };
  } catch (error) {
    console.error('Error disabling 2FA:', error);
    throw error;
  }
};

/**
 * Check if user has pending OTP verification
 */
export const hasPendingOTP = async (userId) => {
  try {
    const user = await User.findById(userId).select('+otpCode');
    if (!user) return false;

    // OTP is pending if code exists and hasn't expired
    return user.otpCode && user.otpExpires && new Date() < user.otpExpires;
  } catch (error) {
    console.error('Error checking pending OTP:', error);
    return false;
  }
};

/**
 * Resend OTP (after validation that user has pending 2FA)
 */
export const resendOTP = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    // Check if user has 2FA enabled
    if (!user.is2FAEnabled) {
      throw new Error('2FA is not enabled for this user');
    }

    // Check if user is blocked
    if (user.otpBlocked && user.otpBlockedUntil > new Date()) {
      throw new Error('OTP attempts temporarily blocked. Please try again later.');
    }

    // Generate new OTP
    const plainOTP = generateOTP();
    const hashedOTP = await hashOTP(plainOTP);

    // Set new expiration
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Update user
    await User.findByIdAndUpdate(userId, {
      otpCode: hashedOTP,
      otpExpires: expiresAt,
      otpAttempts: 0
    });

    // Send OTP
    await sendOTPViaSMS(userId, plainOTP);

    return {
      success: true,
      message: 'OTP resent to phone number',
      expiresIn: OTP_EXPIRY_MINUTES * 60
    };
  } catch (error) {
    console.error('Error resending OTP:', error);
    throw error;
  }
};

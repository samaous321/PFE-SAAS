import rateLimit from "express-rate-limit";

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 400,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests, please try again later"
  }
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many authentication attempts, please try again later"
  }
});

/**
 * Rate limiter for OTP verification endpoint
 * Stricter limits: 10 attempts per 15 minutes
 */
export const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many OTP verification attempts. Please try again later."
  },
  skip: (req, res) => {
    // Skip rate limiting for non-POST requests
    return req.method !== 'POST';
  }
});

/**
 * Rate limiter for OTP resend endpoint
 * Stricter limits: 3 attempts per 30 minutes
 */
export const otpResendLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many OTP resend attempts. Please try again after 30 minutes."
  },
  skip: (req, res) => {
    return req.method !== 'POST';
  }
});

/**
 * Rate limiter for 2FA enable/disable endpoints
 */
export const twoFAConfigLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many 2FA configuration changes. Please try again later."
  },
  skip: (req, res) => {
    return req.method !== 'POST' && req.method !== 'PUT';
  }
});

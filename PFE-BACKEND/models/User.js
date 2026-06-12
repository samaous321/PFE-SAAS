import mongoose from 'mongoose';
import { ROLES } from '../constants/roles.js';
const { Schema, model } = mongoose;

const userSchema = Schema({
  tenantId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Tenant",
    required: function () {
      return this.role !== ROLES.SUPERADMIN;
    },
    index: true
  },
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String,
    required: true
  },
  email: {
     type: String, 
     unique: true, 
     required: true 
    },
  phoneNumber: {
    type: String,
    required: false,
  },
  password: {
  type: String,
  required: true,
  select: false
  },
  role: {
    type: String,
    enum: [ROLES.SUPERADMIN, ROLES.TENANT_ADMIN, ROLES.USER],
    default: ROLES.USER
  },
  verified: {
    type: Boolean,
    default: false,
  },
  mfaEnabled: { 
    type: Boolean, 
    default: false 
  },
  verificationCode: {
    type: Number,
    default: null,
    required: false
  },
  mfaSecret: String,
  // 2FA OTP Configuration
  is2FAEnabled: {
    type: Boolean,
    default: false,
    index: true
  },
  otpCode: {
    type: String,
    default: null,
    select: false
  },
  otpExpires: {
    type: Date,
    default: null,
    index: true
  },
  otpAttempts: {
    type: Number,
    default: 0
  },
  otpBlocked: {
    type: Boolean,
    default: false
  },
  otpBlockedUntil: {
    type: Date,
    default: null
  },
  status: { 
    type: String, 
    default: "active" 
  },
  token: {
    type: String,
    default: null,
    required: false
  },
  failedAttempts: { 
    type: Number, 
    default: 0 
  },
  lastLogin: Date,
  
}, { timestamps: true });


export default model('User', userSchema);


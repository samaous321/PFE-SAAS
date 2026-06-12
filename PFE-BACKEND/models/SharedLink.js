import mongoose from "mongoose";

const sharedLinkSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true
    },

    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "File",
      required: true,
      index: true
    },

    shareHistoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ShareHistory",
      default: null,
      index: true
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    recipientUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },

    recipientUserIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }],

    hiddenForUserIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true
    }],

    recipientEmail: {
      type: String,
      trim: true,
      lowercase: true
    },

    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    maxUses: {
      type: Number,
      default: 1,
      min: 1
    },

    usedCount: {
      type: Number,
      default: 0,
      min: 0
    },

    expiresAt: {
      type: Date,
      required: true,
      index: true
    },

    revokedAt: {
      type: Date,
      default: null
    },

    lastAccessedAt: {
      type: Date,
      default: null
    },

    permissions: {
      type: [String],
      default: ["download"],
      validate: {
        validator: (permissions) => permissions.every((permission) => ["download"].includes(permission)),
        message: "Unsupported shared link permission"
      }
    },

    // SECURITY: Access control modes
    accessControl: {
      type: String,
      enum: ["public", "recipient-only", "ip-restricted"],
      default: "public",
      description: "public = anyone with link, recipient-only = auth required as recipient, ip-restricted = whitelisted IPs only"
    },

    // SECURITY: For recipient-only links - require authentication as this user
    requireRecipientAuth: {
      type: Boolean,
      default: false
    },

    // SECURITY: IP whitelist for access restrictions
    allowedIPs: {
      type: [String],
      default: []
    },

    // SECURITY: Password protection (optional additional layer)
    passwordHash: {
      type: String,
      default: null
    },

    // AUDIT: Log access attempts
    accessLog: [{
      userId: mongoose.Schema.Types.ObjectId,
      ipAddress: String,
      userAgent: String,
      timestamp: { type: Date, default: Date.now },
      success: Boolean,
      failureReason: String
    }],

    // SECURITY: Download reason for audit trail
    purpose: {
      type: String,
      enum: ["temporary-access", "archive-backup", "external-review", "approval-workflow"],
      default: "temporary-access"
    },

    // SECURITY: Metadata for compliance
    securityLevel: {
      type: String,
      enum: ["public", "internal", "confidential", "restricted"],
      default: "internal"
    },

    shareSubject: {
      type: String,
      trim: true,
      default: ""
    },

    shareDescription: {
      type: String,
      trim: true,
      default: ""
    }
  },
  { timestamps: true }
);

sharedLinkSchema.index({ tenantId: 1, fileId: 1, revokedAt: 1 });

export default mongoose.model("SharedLink", sharedLinkSchema);
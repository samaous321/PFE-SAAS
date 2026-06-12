import mongoose from "mongoose";
import { randomUUID } from "crypto";
import { ROLES } from "../constants/roles.js";

const complaintMessageSchema = new mongoose.Schema(
  {
    authorType: {
      type: String,
      enum: ["user", "admin"],
      required: true,
      index: true,
    },
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    isInternalNote: {
      type: Boolean,
      default: false,
    },
    attachments: [
      {
        fileName: String,
        fileUrl: String,
        mimeType: String,
        fileSize: Number,
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const complaintAuditSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      trim: true,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: [ROLES.SUPERADMIN, ROLES.TENANT_ADMIN, ROLES.USER],
      required: true,
    },
    details: mongoose.Schema.Types.Mixed,
    at: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const complaintSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      unique: true,
      index: true,
    },
    requester: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },
      tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Tenant",
        default: null,
        index: true,
      },
      email: {
        type: String,
        required: true,
      },
      fullName: {
        type: String,
        required: true,
      },
    },
    category: {
      type: String,
      enum: ["technical", "billing", "access", "security", "other"],
      default: "other",
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 10000,
    },
    status: {
      type: String,
      enum: ["open", "in_progress", "pending_user", "resolved", "closed", "rejected"],
      default: "open",
      index: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    attachments: [
      {
        fileName: String,
        fileUrl: String,
        mimeType: String,
        fileSize: Number,
      },
    ],
    messages: {
      type: [complaintMessageSchema],
      default: [],
    },
    counters: {
      adminMessages: {
        type: Number,
        default: 0,
      },
      userMessages: {
        type: Number,
        default: 0,
      },
    },
    sla: {
      firstResponseDueAt: Date,
      resolutionDueAt: Date,
      firstRespondedAt: Date,
      resolvedAt: Date,
    },
    cancelReason: String,
    resolveReason: String,
    rejectReason: String,
    closedAt: Date,
    lastActivityAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    auditTrail: {
      type: [complaintAuditSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: "complaints",
  }
);

complaintSchema.index({ "requester.tenantId": 1, status: 1, createdAt: -1 });
complaintSchema.index({ "requester.userId": 1, createdAt: -1 });
complaintSchema.index({ priority: 1, createdAt: -1 });
complaintSchema.index({ status: 1, priority: 1, createdAt: -1 });

complaintSchema.pre("validate", function complaintTicketId(next) {
  if (!this.ticketId) {
    const year = new Date().getFullYear();
    const uid = randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
    this.ticketId = `REC-${year}-${uid}`;
  }

  if (typeof next === "function") {
    next();
  }
});

export default mongoose.model("Complaint", complaintSchema);

import mongoose from "mongoose";

const notificationActionSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      trim: true,
      default: ""
    },
    kind: {
      type: String,
      trim: true,
      default: ""
    },
    entityId: {
      type: String,
      trim: true,
      default: ""
    },
    queryParams: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { _id: false }
);

const notificationSchema = new mongoose.Schema(
  {
    recipientUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
      index: true
    },
    type: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 600
    },
    tone: {
      type: String,
      enum: ["info", "success", "warning", "danger"],
      default: "info"
    },
    iconKey: {
      type: String,
      trim: true,
      default: "notification"
    },
    action: {
      type: notificationActionSchema,
      default: () => ({})
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    readAt: {
      type: Date,
      default: null,
      index: true
    }
  },
  {
    timestamps: true,
    collection: "notifications"
  }
);

notificationSchema.index({ recipientUserId: 1, createdAt: -1 });
notificationSchema.index({ recipientUserId: 1, readAt: 1, createdAt: -1 });

export default mongoose.model("Notification", notificationSchema);

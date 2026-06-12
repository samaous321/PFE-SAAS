import mongoose from "mongoose";

const ActivitySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true },
    type: { type: String, required: true }, // e.g. 'auth', 'file', 'share', 'complaint'
    action: { type: String, required: true }, // e.g. 'login', 'download', 'create_share'
    resourceId: { type: mongoose.Schema.Types.Mixed },
    resourceType: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true }
);

ActivitySchema.index({ userId: 1, createdAt: -1 });
ActivitySchema.index({ tenantId: 1, createdAt: -1 });

const Activity = mongoose.model("Activity", ActivitySchema);
export default Activity;

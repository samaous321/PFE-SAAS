import mongoose from "mongoose";
const { Schema, model } = mongoose;

const tenantSchema = new Schema({
    name: {
      type: String,
      required: true,
      trim: true,
    },

    domain: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    subscriptionPlan: {
      type: String,
      default: "small",
    },

    quotaOverrides: {
      tenant: {
        storageBytes: { type: Number, default: null },
        maxUsers: { type: Number, default: null },
        maxFiles: { type: Number, default: null },
        maxFolders: { type: Number, default: null },
      },
      user: {
        storageBytes: { type: Number, default: null },
        maxFiles: { type: Number, default: null },
        maxDailyUploadBytes: { type: Number, default: null },
      },
    },

    status: {
      type: String,
      enum: ["active", "suspended", "inactive"],
      default: "active",
    },
  },
  {
    timestamps: true,
  }
);

export default model("Tenant", tenantSchema);
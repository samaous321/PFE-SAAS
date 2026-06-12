import mongoose from "mongoose";

const { Schema, model } = mongoose;

const planSchema = new Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      default: "",
      trim: true
    },
    storageBytes: {
      type: Number,
      default: null
    },
    maxUsers: {
      type: Number,
      default: null
    },
    maxFiles: {
      type: Number,
      default: null
    },
    maxFolders: {
      type: Number,
      default: null
    },
    userStorageBytes: {
      type: Number,
      default: null
    },
    userMaxFiles: {
      type: Number,
      default: null
    },
    userDailyUploadBytes: {
      type: Number,
      default: null
    },
    isDefault: {
      type: Boolean,
      default: false
    },
    sortOrder: {
      type: Number,
      default: 0
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

export default model("Plan", planSchema);
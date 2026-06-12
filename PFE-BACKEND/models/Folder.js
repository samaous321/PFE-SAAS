import mongoose from "mongoose";

const folderSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Folder",
      default: null,
      index: true
    },
    path: {
      type: String,
      default: "/",
      index: true
    },
    color: {
      type: String,
      default: "#3b82f6",
      trim: true
    },
    icon: {
      type: String,
      default: "folder",
      trim: true
    },
    position: {
      type: Number,
      default: 0
    },
    isRoot: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

folderSchema.index({ ownerId: 1, name: 1, parentId: 1 }, { unique: true });
folderSchema.index({ ownerId: 1, position: 1 });
folderSchema.index({ path: 1 });

export default mongoose.model("Folder", folderSchema);

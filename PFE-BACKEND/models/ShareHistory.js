import mongoose from "mongoose";

const shareHistorySchema = new mongoose.Schema(
  {
    // ===== IDENTIFICATION =====
    shareId: { 
      type: String, 
      required: true, 
      unique: true,
      index: true,
      description: "Unique share identifier"
    },
    
    // ===== ACTEURS =====
    sharedBy: {
      userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "User", 
        required: true,
        index: true
      },
      email: { type: String, required: true },
      tenantId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "Tenant",
        index: true
      },
      ipAddress: String,
      userAgent: String
    },

    sharedWith: {
      userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "User"
      },
      email: { type: String, required: true },
      recipientEmails: [{ type: String, trim: true, lowercase: true }],
      recipientCount: { type: Number, default: 1 },
      tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant" },
      externalUser: { type: Boolean, default: false }
    },

    // ===== FICHIER =====
    fileId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "File", 
      required: true,
      index: true
    },
    fileName: { type: String, required: true },
    fileSize: { type: Number, required: true },
    mimeType: { type: String },
    fileHash: { type: String }, // SHA256 du fichier pour intégrité
    shareUrl: { type: String, default: null },

    // ===== DÉTAILS DU PARTAGE =====
    shareType: { 
      type: String, 
      enum: ["direct", "link", "public"],
      default: "direct",
      index: true
    },
    accessLevel: { 
      type: String, 
      enum: ["view", "download", "edit"],
      default: "view",
      index: true
    },
    expiresAt: { 
      type: Date,
      index: true
    },
    hasPassword: { type: Boolean, default: false },
    maxDownloads: { type: Number, default: null }, // null = illimité
    
    // ===== NOTES & DESCRIPTION =====
    note: { 
      type: String, 
      default: null,
      description: "Message/Note from sender about the share"
    },
    subject: {
      type: String,
      default: null,
      description: "Subject line for the share notification email"
    },
    
    // ===== MÉTADONNÉES D'ACCÈS =====
    downloadCount: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 },
    lastAccessedAt: Date,
    firstAccessedAt: Date,
    accessLogs: [{
      timestamp: { type: Date, default: Date.now },
      action: { 
        type: String, 
        enum: ["view", "download", "preview"],
        default: "view"
      },
      ipAddress: String,
      userAgent: String,
      userLocation: {
        country: String,
        city: String,
        lat: Number,
        lon: Number
      },
      accessedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Utilisateur qui accède
      success: { type: Boolean, default: true },
      errorMessage: String
    }],

    // ===== STATUS =====
    status: { 
      type: String, 
      enum: ["active", "revoked", "expired"],
      default: "active",
      index: true
    },
    revokedAt: Date,
    revokeReason: { type: String },
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // ===== AUDIT TRAIL =====
    createdAt: { type: Date, default: Date.now, index: true },
    updatedAt: { type: Date, default: Date.now },
    auditTrail: [{
      action: String, // "created", "revoked", "accessed", "quota_changed"
      timestamp: { type: Date, default: Date.now },
      performedBy: mongoose.Schema.Types.ObjectId,
      changes: mongoose.Schema.Types.Mixed
    }]
  },
  { 
    timestamps: true,
    collection: "share_history"
  }
);

// ===== INDEXES CRITIQUES =====
shareHistorySchema.index({ "sharedBy.userId": 1, createdAt: -1 });
shareHistorySchema.index({ "sharedBy.tenantId": 1, createdAt: -1 });
shareHistorySchema.index({ "sharedWith.email": 1 });
shareHistorySchema.index({ status: 1, expiresAt: 1 });
shareHistorySchema.index({ fileId: 1, "sharedBy.userId": 1 });
shareHistorySchema.index({ createdAt: -1 }); // Pour tri par date

// ===== HOOKS =====
shareHistorySchema.pre("save", async function(next) {
  this.updatedAt = new Date();
  if (typeof next === "function") {
    next();
  }
});

// Auto-expiration: marquer comme expiré si expiresAt < maintenant
shareHistorySchema.methods.checkExpiration = function() {
  if (this.expiresAt && new Date() > this.expiresAt && this.status === "active") {
    this.status = "expired";
    return this.save();
  }
  return Promise.resolve();
};

// Vérifier si le quota de téléchargements est atteint
shareHistorySchema.methods.isDownloadQuotaExceeded = function() {
  if (this.maxDownloads === null) return false;
  return this.downloadCount >= this.maxDownloads;
};

// Ajouter un accès au log
shareHistorySchema.methods.addAccessLog = function(accessData) {
  if (this.firstAccessedAt === null) {
    this.firstAccessedAt = new Date();
  }
  this.lastAccessedAt = new Date();

  if (accessData.action === "download") {
    this.downloadCount += 1;
  } else if (accessData.action === "view") {
    this.viewCount += 1;
  }

  this.accessLogs.push(accessData);
  return this.save();
};

export default mongoose.model("ShareHistory", shareHistorySchema);
// import mongoose from "mongoose";

// const fileSchema = new mongoose.Schema({
//   tenantId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Tenant",
//     required: true,
//     index: true
//   },
//   ownerId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "User",
//     required: true
//   },
//   sharedWith: [{
//    type: mongoose.Schema.Types.ObjectId,
//    ref: "User"
// }],
//   filename: { 
//     type: String, 
//     required: true 
// },
//   originalName: String,
//   mimeType: String,
//   storagePath: { 
//     type: String, 
//     required: true 
// },
//   iv: String,
//   authTag: String,
//   hash: String,
//   size: Number,
//   encryptionKeyId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "EncryptionKey"
//   },
//   downloadCount: { 
//     type: Number, 
//     default: 0 
// },
//   maxDownloads: { 
//     type: Number, 
//     default: 10 
// },
//   allowedIPs: [String],
//   status: { 
//     type: String, 
//     default: "active" 
// },
//   expirationDate: Date
// }, { timestamps: true });

// export default mongoose.model("File", fileSchema);




import mongoose from "mongoose";

const fileSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tenant",
    required: true,
    index: true
  },

  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  ownerSpaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Folder",
    default: null,
    index: true
  },

  sharedWith: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }],

  bucketName: {
    type: String,
    required: true,
    trim: true
  },

  storageProvider: {
    type: String,
    enum: ["minio"],
    default: "minio"
  },

  filename: {
    type: String,
    required: true
  },

  originalName: {
    type: String,
    required: true
  },

  description: {
    type: String,
    trim: true,
    default: ""
  },

  mimeType: String,

  storagePath: {
    type: String,
    required: true
  },

  contentHash: {
    type: String,
    required: false,
    index: true
  },

  iv: {
    type: String,
    required: true
  },

  authTag: {
    type: String,
    required: true
  },

  integrity: {
    type: String,
    required: true
  },

  size: Number,

  encryptionKeyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "EncryptionKey",
    required: true
  },

  scanStatus: {
    type: String,
    enum: ["pending", "clean", "infected", "failed"],
    default: "pending",
    index: true
  },

  scanViruses: [{
    type: String,
    trim: true
  }],

  scannedAt: {
    type: Date
  },

  // Advanced scan metadata (ClamAV + VT Queue)
  scanMetadata: {
    clamavResult: {
      status: String,
      isInfected: Boolean,
      viruses: [String],
      timestamp: Date,
      reason: String
    },
    validationReport: {
      isValid: Boolean,
      flags: [String],
      riskLevel: String,
      recommendations: [String]
    },
    virustotalResult: {
      status: String,
      engines_detected: Number,
      engines_total: Number,
      results: mongoose.Schema.Types.Mixed,
      timestamp: Date
    },
    aiClassification: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    aiAnalysis: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    aiAnalyzedAt: Date,
    aiStatus: {
      type: String,
      enum: ["pending", "done", "failed"],
      default: "pending"
    },
    lastScannedAt: Date,
    quarantineStatus: {
      type: String,
      enum: ["clean", "quarantined", "unknown"],
      default: "unknown"
    },
    whitelistedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    whitelistReason: {
      type: String,
      trim: true
    },
    whitelistDate: {
      type: Date
    },
    investigationNotes: {
      type: String,
      trim: true
    }
  },

  // Encryption metadata for audit & key rotation
  encryptionMetadata: {
    algorithm: String,
    keyDerivation: String,
    version: String,
    rotationEligible: {
      type: Boolean,
      default: false
    },
    rotatedAt: Date
  },

  downloadCount: {
    type: Number,
    default: 0
  },

  maxDownloads: {
    type: Number,
    default: 10
  },

  allowedIPs: [String],

  status: {
    type: String,
    enum: ["active", "expired", "blocked", "quarantined"],
    default: "active"
  },

  expirationDate: Date

}, { timestamps: true });

export default mongoose.model("File", fileSchema);
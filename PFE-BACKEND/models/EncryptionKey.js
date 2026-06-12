// import mongoose from "mongoose";

// const encryptionKeySchema = new mongoose.Schema({
//   fileId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "File",
//     required: true
//   },
//   encryptedKey: String,
//   algorithm: { 
//     type: String, 
//     default: "AES-256" 
// },
//   rotationDate: Date
// }, { timestamps: true });

// export default mongoose.model("EncryptionKey", encryptionKeySchema);



import mongoose from "mongoose";

const encryptionKeySchema = new mongoose.Schema({

  encryptedKey: {
    type: String,
    required: true
  },

  iv: {
    type: String,
    required: true
  },

  algorithm: {
    type: String,
    enum: ["AES-256-GCM"],
    default: "AES-256-GCM"
  },

  rotationDate: {
    type: Date,
    default: Date.now
  }

}, { timestamps: true });

export default mongoose.model("EncryptionKey", encryptionKeySchema);
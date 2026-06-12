// import express from "express";
// import multer from "multer";
// import { uploadFile } from "../controllers/file.controller.js";
// import { verifyToken } from "../middlewares/auth.middleware.js";

// const router = express.Router();

// const upload = multer({ dest: "uploads/" });

// router.post("/upload", verifyToken, upload.single("file"), uploadFile);

// export default router;


import express from "express";
import multer from "multer";
import {
  getMyFiles,
  getUserFolders,
  createUserFolder,
  updateUserFolder,
  deleteUserFolder,
  assignFileToSpace,
  getTenantFiles,
  getAllFilesAdmin,
  getAdminAlerts,
  getAdminAlertById,
  manageQuarantinedFile,
  uploadFile,
  share,
  downloadShared,
  rescanShared,
  revokeShare,
  download,
  remove,
  updateFileSettings,
  getFilesSharedWithMe,
  getFilesSharedByMe,
  hideSharedWithMe,
  restoreSharedWithMe,
  getAnalytics,
  searchFilesAndFolders
} from "../controllers/file.controller.js";
import { authenticateToken, authenticateTokenOptional, requireRole } from "../middlewares/auth.middleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

const upload = multer({ dest: "uploads/" });

router.get(
  "/mine",
  authenticateToken,
  getMyFiles
);

router.get(
  "/folders",
  authenticateToken,
  getUserFolders
);

router.post(
  "/folders",
  authenticateToken,
  createUserFolder
);

router.put(
  "/folders/:folderId",
  authenticateToken,
  updateUserFolder
);

router.delete(
  "/folders/:folderId",
  authenticateToken,
  deleteUserFolder
);

router.get(
  "/tenant",
  authenticateToken,
  requireRole(ROLES.SUPERADMIN, ROLES.TENANT_ADMIN),
  getTenantFiles
);

router.get(
  "/admin/all",
  authenticateToken,
  requireRole(ROLES.SUPERADMIN, ROLES.TENANT_ADMIN),
  getAllFilesAdmin
);

router.get(
  "/admin/alerts",
  authenticateToken,
  requireRole(ROLES.SUPERADMIN, ROLES.TENANT_ADMIN),
  getAdminAlerts
);

router.get(
  "/admin/alerts/:fileId",
  authenticateToken,
  requireRole(ROLES.SUPERADMIN, ROLES.TENANT_ADMIN),
  getAdminAlertById
);

router.patch(
  "/admin/alerts/:fileId",
  authenticateToken,
  requireRole(ROLES.SUPERADMIN, ROLES.TENANT_ADMIN),
  manageQuarantinedFile
);

router.get(
  "/analytics",
  authenticateToken,
  getAnalytics
);

router.get(
  "/search",
  authenticateToken,
  searchFilesAndFolders
);

router.post(
  "/upload",
  authenticateToken,
  upload.single("file"),
  uploadFile
);

router.post(
  "/:fileId/share",
  authenticateToken,
  share
);

router.get(
  "/shared/:token/download",
  authenticateTokenOptional,
  downloadShared
);

router.post(
  "/shared/:token/rescan",
  authenticateTokenOptional,
  rescanShared
);

router.delete(
  "/shared/:linkId",
  authenticateToken,
  revokeShare
);

router.get(
  "/:fileId/download",
  authenticateToken,
  download
);

router.put(
  "/:fileId",
  authenticateToken,
  updateFileSettings
);

router.patch(
  "/:fileId/space",
  authenticateToken,
  assignFileToSpace
);

router.delete(
  "/:fileId",
  authenticateToken,
  remove
);

router.get(
  "/shared-with-me",
  authenticateToken,
  getFilesSharedWithMe
);

router.patch(
  "/shared-with-me/:linkId/hide",
  authenticateToken,
  hideSharedWithMe
);

router.patch(
  "/shared-with-me/:linkId/restore",
  authenticateToken,
  restoreSharedWithMe
);

router.get(
  "/shared-by-me",
  authenticateToken,
  getFilesSharedByMe
);

export default router;
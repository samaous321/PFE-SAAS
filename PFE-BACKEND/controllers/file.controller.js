// import * as fileService from "../services/file.service.js";

// export const create = async (req, res) => {
//   const file = await fileService.createFile(req.body);
//   res.status(201).json(file);
// };

// export const getAll = async (req, res) => {
//   const files = await fileService.getFilesByTenant(req.params.tenantId);
//   res.json(files);
// };

// export const getOne = async (req, res) => {
//   const file = await fileService.getFileById(req.params.id);
//   res.json(file);
// };

// export const update = async (req, res) => {
//   const file = await fileService.updateFile(req.params.id, req.body);
//   res.json(file);
// };

// export const remove = async (req, res) => {
//   await fileService.deleteFile(req.params.id);
//   res.json({ message: "File deleted" });
// };

// /*************************************** */
// export const uploadFile = async (req, res) => {
//   try {
//     const file = await fileService.uploadAndSecureFile(req.file, req.user);
//     res.status(201).json(file);
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// };

// export const share = async (req, res) => {
//   const file = await fileService.shareFile(
//     req.params.fileId,
//     req.body.userId
//   );
//   res.json(file);
// };


import * as fileService from "../services/file.service.js";

export const uploadFile = async (req, res) => {
  try {
    const file =
      await fileService.uploadAndSecureFile(
        req.file,
        req.user,
        req.body
      );

    res.status(201).json(file);

  } catch (err) {
    res.status(err.statusCode || 400).json({
      error: err.message,
      code: err.code,
      details: err.details
    });
  }
};

export const getMyFiles = async (req, res) => {
  try {
    const files = await fileService.getMyFiles(req.user, req.query);
    res.json(files);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const getUserFolders = async (req, res) => {
  try {
    const folders = await fileService.getUserFolders(req.user);
    res.json(folders);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const createUserFolder = async (req, res) => {
  try {
    const folder = await fileService.createUserFolder(req.user, req.body);
    res.status(201).json(folder);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const updateUserFolder = async (req, res) => {
  try {
    const folder = await fileService.updateUserFolder(req.params.folderId, req.user, req.body);
    res.json(folder);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const deleteUserFolder = async (req, res) => {
  try {
    await fileService.deleteUserFolder(req.params.folderId, req.user);
    res.json({ message: "Folder deleted" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const assignFileToSpace = async (req, res) => {
  try {
    const file = await fileService.assignFileToSpace(req.params.fileId, req.user, req.body);
    res.json(file);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const getTenantFiles = async (req, res) => {
  try {
    const files = await fileService.getTenantFiles(req.user);
    res.json(files);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const getAllFilesAdmin = async (req, res) => {
  try {
    const files = await fileService.getAllFilesForAdmin(req.user);
    res.json(files);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const getAdminAlerts = async (req, res) => {
  try {
    const alerts = await fileService.getMalwareAlerts(req.user, {
      tenantId: req.query.tenantId,
      ownerId: req.query.ownerId,
      scanStatus: req.query.scanStatus,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      sortBy: req.query.sortBy,
      page: req.query.page,
      limit: req.query.limit
    });
    res.json(alerts);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const getAdminAlertById = async (req, res) => {
  try {
    const alert = await fileService.getMalwareAlertById(req.user, req.params.fileId);
    res.json(alert);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const manageQuarantinedFile = async (req, res) => {
  try {
    const result = await fileService.manageQuarantinedFile(
      req.user,
      req.params.fileId,
      req.body.action,
      {
        reason: req.body.reason,
        notes: req.body.notes
      }
    );
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const share = async (req, res) => {
  try {
    const shareLink =
      await fileService.createShareLink(
        req.params.fileId,
        req.user,
        req.body
      );

    res.status(201).json(shareLink);

  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const updateFileSettings = async (req, res) => {
  try {
    const file = await fileService.updateFileSettings(req.params.fileId, req.user, req.body);
    res.json(file);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};


export const downloadShared = async (req, res) => {
  try {
    // Extract IP address for logging and IP-restricted links
    const ipAddress =
      req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      "unknown";

    // Optional: Pass requester if authenticated (for recipient-only links)
    const requester = req.user ? {
      userId: req.user.userId || req.user.id || req.user._id,
      tenantId: req.user.tenantId,
      userAgent: req.headers["user-agent"]
    } : null;

    const result = await fileService.downloadSharedLink(
      req.params.token,
      requester,
      ipAddress
    );

    res.set({
      "Content-Type": result.mimeType,
      "Content-Disposition":
        `attachment; filename="${result.originalName}"`
    });

    res.send(result.buffer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const rescanShared = async (req, res) => {
  try {
    const ipAddress =
      req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      "unknown";

    const requester = req.user ? {
      userId: req.user.userId || req.user.id || req.user._id,
      tenantId: req.user.tenantId,
      userAgent: req.headers["user-agent"]
    } : null;

    const result = await fileService.rescanSharedLink(
      req.params.token,
      requester,
      ipAddress
    );

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const revokeShare = async (req, res) => {
  try {
    await fileService.revokeShareLink(req.params.linkId, req.user);
    res.json({ message: "Share link revoked" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};



export const download = async (req, res) => {
  try {
    const result =
      await fileService.downloadFile(
        req.params.fileId,
        req.user,
        req.ip
      );

    res.set({
      "Content-Type": result.mimeType,
      "Content-Disposition":
        `attachment; filename="${result.originalName}"`
    });

    res.send(result.buffer);

  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};



export const remove = async (req, res) => {
  try {
    await fileService.deleteFile(
      req.params.fileId,
      req.user.userId,
      req.user.tenantId,
      req.user.role
    );

    res.json({ message: "File deleted" });

  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const getFilesSharedWithMe = async (req, res) => {
  try {
    const sharedFiles = await fileService.getFilesSharedWithMe(req.user, req.query);
    res.json(sharedFiles);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const hideSharedWithMe = async (req, res) => {
  try {
    const result = await fileService.hideSharedLinkForRecipient(req.params.linkId, req.user);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const restoreSharedWithMe = async (req, res) => {
  try {
    const result = await fileService.restoreSharedLinkForRecipient(req.params.linkId, req.user);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const getFilesSharedByMe = async (req, res) => {
  try {
    const sharedFiles = await fileService.getFilesSharedByMe(req.user);
    res.json(sharedFiles);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const getAnalytics = async (req, res) => {
  try {
    const analytics = await fileService.getAnalytics(req.user, {
      year: req.query.year,
      month: req.query.month,
      scope: req.query.scope
    });

    res.json(analytics);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const searchFilesAndFolders = async (req, res) => {
  try {
    const { q, type, folderId, limit = 50, offset = 0 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: "Search query must be at least 2 characters long" });
    }

    const results = await fileService.searchFilesAndFolders(req.user, {
      query: q.trim(),
      type: type, // 'files', 'folders', or undefined for both
      folderId: folderId, // search within specific folder
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json(results);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

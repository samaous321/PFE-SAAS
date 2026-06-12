/**
 * PHASE 2: Admin management of quarantined files
 * Allows SUPERADMIN and TENANT_ADMIN to investigate and decide fate of quarantined files
 */
export const adminManageQuarantinedFile = async (requester, fileId, action, options = {}) => {
  // SECURITY: Only admins can manage quarantined files
  if (requester.role !== "SUPERADMIN" && requester.role !== "TENANT_ADMIN") {
    throw new Error("Access denied: Admin privileges required");
  }

  const file = await File.findById(fileId).populate("ownerId", "firstName lastName email");
  if (!file) {
    throw new Error("File not found");
  }

  // SECURITY: Tenant isolation for TENANT_ADMIN
  if (requester.role === "TENANT_ADMIN" && file.tenantId.toString() !== requester.tenantId.toString()) {
    throw new Error("Access denied: File belongs to different tenant");
  }

  // VALIDATION: File must be quarantined
  if (file.status !== "quarantined" && file.scanMetadata?.quarantineStatus !== "quarantined") {
    throw new Error("File is not quarantined");
  }

  const now = new Date();

  switch (action) {
    case "whitelist":
      // Allow file and mark as safe
      file.status = "active";
      file.scanMetadata.quarantineStatus = "clean";
      file.scanMetadata.whitelistedBy = requester.userId;
      file.scanMetadata.whitelistReason = options.reason || "Admin approved after investigation";
      file.scanMetadata.whitelistDate = now;
      file.scanMetadata.investigationNotes = options.notes || "";
      break;

    case "block":
      // Permanently block file
      file.status = "blocked";
      file.scanMetadata.quarantineStatus = "quarantined"; // Keep quarantine status for audit
      file.scanMetadata.investigationNotes = options.notes || "Admin blocked after investigation";
      break;

    case "investigate":
      // Update investigation notes without changing status
      file.scanMetadata.investigationNotes = options.notes || file.scanMetadata.investigationNotes || "";
      break;

    default:
      throw new Error("Invalid action. Use 'whitelist', 'block', or 'investigate'");
  }

  await file.save();

  // AUDIT: Log admin action
  await logAdminAction(requester, "quarantine_management", {
    fileId: file._id,
    fileName: file.originalName,
    action,
    reason: options.reason,
    notes: options.notes,
    tenantId: file.tenantId
  });

  return {
    fileId: file._id,
    action,
    newStatus: file.status,
    quarantineStatus: file.scanMetadata.quarantineStatus,
    updatedAt: file.updatedAt,
    investigator: `${requester.firstName} ${requester.lastName}`,
    investigationNotes: file.scanMetadata.investigationNotes
  };
};
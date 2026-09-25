const AuditLog = require("../models/auditLog");

const createAuditLog = async ({
  user,
  action,
  module,
  description,
  recordId = null,
  metadata = {},
}) => {
  try {
    const auditLog = await AuditLog.create({
      userId: user?.userId || null,
      userRole: user?.role || "",
      userEmail: user?.email || "",
      action,
      module,
      description,
      recordId,
      metadata,
    });

    console.log("AUDIT LOG CREATED:", {
      id: auditLog._id.toString(),
      action: auditLog.action,
      module: auditLog.module,
      recordId: auditLog.recordId
        ? auditLog.recordId.toString()
        : null,
    });

    return auditLog;
    } catch (error) {
    console.error("======================================");
    console.error("AUDIT LOG CREATION FAILED");
    console.error("Message:", error.message);
    console.error("Name:", error.name);
    console.error("Code:", error.code);
    console.error("Full Error:", error);
    console.error("======================================");

    // Audit logging should never stop the main operation.
    return null;
  }
};

module.exports = {
  createAuditLog,
};
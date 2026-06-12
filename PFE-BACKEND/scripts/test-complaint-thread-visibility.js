import "dotenv/config";
import dbConnection from "../config/db.js";
import User from "../models/User.js";
import jwt from "jsonwebtoken";
import fetch from "node-fetch";
import { ROLES } from "../constants/roles.js";

const api = async (url, method, token, body) => {
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  return { status: res.status, data: json };
};

async function main() {
  await dbConnection();

  // Find a SUPERADMIN user (or fallback to users with old "admin" role during migration)
  const admin = await User.findOne({ 
    role: { $in: [ROLES.SUPERADMIN, "admin"] } 
  }).lean();
  const user = await User.findOne({ role: ROLES.USER }).lean();

  if (!admin || !user) {
    console.log("Missing admin or user in DB");
    process.exit(1);
  }

  const adminToken = jwt.sign(
    {
      userId: admin._id.toString(),
      tenantId: admin.tenantId || null,
      role: admin.role,
      email: admin.email,
      firstName: admin.firstName,
      lastName: admin.lastName,
    },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );

  const userToken = jwt.sign(
    {
      userId: user._id.toString(),
      tenantId: user.tenantId || null,
      role: user.role,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );

  const base = `http://localhost:${process.env.PORT}`;

  const created = await api(`${base}/api/complaints`, "POST", userToken, {
    subject: "Thread visibility test",
    description: "Initial user message",
    category: "technical",
    priority: "medium",
  });

  console.log("CREATE:", created.status);
  if (created.status !== 201) {
    console.log(created.data);
    process.exit(1);
  }

  const ticketId = created.data?.data?.ticketId;

  const adminReply = await api(
    `${base}/api/admin/complaints/${ticketId}/messages`,
    "POST",
    adminToken,
    {
      message: "Admin visible reply",
      isInternalNote: false,
    }
  );

  console.log("ADMIN_REPLY:", adminReply.status);
  if (adminReply.status !== 200) {
    console.log(adminReply.data);
    process.exit(1);
  }

  const userRead = await api(`${base}/api/complaints/${ticketId}`, "GET", userToken);
  console.log("USER_READ:", userRead.status);
  console.log("USER_READ_BODY:", userRead.data);

  const messages = userRead.data?.data?.messages || [];
  console.log("USER_MESSAGES_COUNT:", messages.length);
  console.log(
    "USER_MESSAGES:",
    messages.map((m) => ({ authorType: m.authorType, message: m.message, isInternalNote: m.isInternalNote }))
  );

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

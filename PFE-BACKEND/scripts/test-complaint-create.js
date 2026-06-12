import "dotenv/config";
import dbConnection from "../config/db.js";
import User from "../models/User.js";
import jwt from "jsonwebtoken";
import fetch from "node-fetch";

async function main() {
  await dbConnection();

  const user = await User.findOne({ role: "user" }).lean();
  if (!user) {
    console.log("NO_USER");
    process.exit(0);
  }

  const token = jwt.sign(
    {
      userId: user._id.toString(),
      tenantId: user.tenantId || null,
      role: user.role,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    },
    process.env.JWT_SECRET,
    { expiresIn: "10m" }
  );

  const res = await fetch(`http://localhost:${process.env.PORT}/api/complaints`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      subject: "Test reclamation API",
      description: "Test automatique depuis script",
      category: "technical",
      priority: "medium",
    }),
  });

  const text = await res.text();
  console.log("STATUS", res.status);
  console.log(text);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import dotenv from "dotenv";
dotenv.config();
import express from "express";
import helmet from "helmet";
import cors from "cors";

import dbConnection from "./config/db.js";
import tenantRoutes from "./routes/tenant.routes.js";
import planRoutes from "./routes/plan.routes.js";
import userRoute from "./routes/user.routes.js";
import fileRoute from "./routes/file.routes.js";
import adminRoute from "./routes/admin.routes.js";
import complaintRoute from "./routes/complaint.routes.js";
import adminComplaintRoute from "./routes/adminComplaint.routes.js";
import notificationRoute from "./routes/notification.routes.js";
import { apiLimiter } from "./middlewares/rate-limit.middleware.js";
import shareHistoryRoutes from "./routes/shareHistory.routes.js";
import auditShareAccess from "./middlewares/auditLogger.middleware.js";  // ✅ Chemin corrigé
import activityRoutes from "./routes/activity.routes.js";
import { hydratePlanQuotas } from "./services/quota.service.js";

const app = express();

// Connect DB
await dbConnection();
await hydratePlanQuotas();

// Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(apiLimiter);

// Audit middleware
app.use(auditShareAccess);

// Routes
app.use("/users", userRoute);
app.use("/tenant", tenantRoutes);
app.use("/plan", planRoutes);
app.use("/file", fileRoute);
app.use("/admin", adminRoute);
app.use("/api/admin", adminRoute);
app.use("/api/shares", shareHistoryRoutes);
app.use("/api/admin/shares", shareHistoryRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/complaints", complaintRoute);
app.use("/api/admin/complaints", adminComplaintRoute);
app.use("/api/notifications", notificationRoute);

// Server
app.listen(process.env.PORT, () =>
  console.log(`Server running at : http://localhost:${process.env.PORT}`)
);

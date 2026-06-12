import mongoose from "mongoose";
import dotenv from "dotenv";
import Notification from "./models/Notification.js";
import User from "./models/User.js";
import Tenant from "./models/Tenant.js";
import { ROLES } from "./constants/roles.js";

dotenv.config();

const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/pfe";

const testQuotaNotifications = async () => {
  try {
    console.log("[Test] Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("[Test] ✅ Connected to MongoDB");

    // 1. Check if SuperAdmins exist
    console.log("\n[Test] Checking for SUPERADMIN users...");
    const superAdmins = await User.find({ role: ROLES.SUPERADMIN }).lean();
    console.log(`[Test] Found ${superAdmins.length} SUPERADMIN(s)`);
    if (superAdmins.length > 0) {
      superAdmins.forEach((admin) => {
        console.log(`  - ${admin.email} (${admin._id})`);
      });
    }

    // 2. Check if TenantAdmins exist
    console.log("\n[Test] Checking for TENANT_ADMIN users...");
    const tenants = await Tenant.find({}).lean();
    
    for (const tenant of tenants) {
      const tenantAdmins = await User.find({
        tenantId: tenant._id,
        role: ROLES.TENANT_ADMIN
      }).lean();
      
      console.log(`\n[Test] Tenant: ${tenant.name} (${tenant._id})`);
      console.log(`  - TENANT_ADMINs: ${tenantAdmins.length}`);
      if (tenantAdmins.length > 0) {
        tenantAdmins.forEach((admin) => {
          console.log(`    - ${admin.email} (${admin._id})`);
        });
      }
    }

    // 3. Check recent quota notifications
    console.log("\n[Test] Checking recent QUOTA notifications...");
    const recentQuotaNotifications = await Notification.find({
      type: "quota",
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24h
    })
      .populate("recipientUserId", "email role")
      .sort({ createdAt: -1 })
      .lean();

    console.log(`[Test] Found ${recentQuotaNotifications.length} quota notification(s) in last 24h`);
    if (recentQuotaNotifications.length > 0) {
      recentQuotaNotifications.forEach((notif, idx) => {
        const user = notif.recipientUserId;
        console.log(`\n  [${idx + 1}] ${notif.title}`);
        console.log(`    - Recipient: ${user?.email || "unknown"} (${notif.recipientUserId})`);
        console.log(`    - Message: ${notif.message}`);
        console.log(`    - Severity: ${notif.metadata?.severity || "unknown"}`);
        console.log(`    - Percent: ${notif.metadata?.percent}%`);
        console.log(`    - Created: ${notif.createdAt}`);
        console.log(`    - Read: ${notif.readAt ? "yes" : "no"}`);
      });
    }

    // 4. Check if there are any unread quota notifications
    console.log("\n[Test] Checking UNREAD quota notifications...");
    const unreadQuotaNotifications = await Notification.find({
      type: "quota",
      readAt: null
    })
      .populate("recipientUserId", "email role")
      .sort({ createdAt: -1 })
      .lean();

    console.log(`[Test] Found ${unreadQuotaNotifications.length} unread quota notification(s)`);
    if (unreadQuotaNotifications.length > 0) {
      unreadQuotaNotifications.forEach((notif, idx) => {
        const user = notif.recipientUserId;
        console.log(`\n  [${idx + 1}] ${notif.title}`);
        console.log(`    - Recipient: ${user?.email || "unknown"} (${notif.recipientUserId})`);
        console.log(`    - Created: ${notif.createdAt}`);
      });
    }

    // 5. Check database counts
    console.log("\n[Test] Database Statistics:");
    const [userCount, tenantCount, notificationCount, quotaNotificationCount] = await Promise.all([
      User.countDocuments({}),
      Tenant.countDocuments({}),
      Notification.countDocuments({}),
      Notification.countDocuments({ type: "quota" })
    ]);
    
    console.log(`  - Total Users: ${userCount}`);
    console.log(`  - Total Tenants: ${tenantCount}`);
    console.log(`  - Total Notifications: ${notificationCount}`);
    console.log(`  - Quota Notifications: ${quotaNotificationCount}`);

    // 6. Test notification creation
    console.log("\n[Test] Testing notification creation...");
    if (superAdmins.length > 0 && tenants.length > 0) {
      const testNotif = {
        recipientUserId: superAdmins[0]._id,
        tenantId: tenants[0]._id,
        type: "quota",
        title: "Test Quota Notification",
        message: "This is a test notification",
        tone: "warning",
        iconKey: "quota",
        action: {
          label: "View Quotas",
          kind: "tenant_quota_detail",
          entityId: String(tenants[0]._id)
        },
        metadata: {
          testCreated: true,
          timestamp: new Date()
        }
      };

      const created = await Notification.create(testNotif);
      console.log(`[Test] ✅ Test notification created: ${created._id}`);

      // Delete the test notification
      await Notification.deleteOne({ _id: created._id });
      console.log(`[Test] ✅ Test notification deleted`);
    } else {
      console.log("[Test] ⚠️  Cannot create test notification: missing superadmins or tenants");
    }

    console.log("\n[Test] ✅ All checks completed!");
  } catch (error) {
    console.error("[Test] ❌ Error:", error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log("[Test] Disconnected from MongoDB");
    process.exit(0);
  }
};

testQuotaNotifications();

/**
 * Migration Script: Role System Refactoring
 * 
 * This script migrates the old role system to the new one:
 * - "admin" → "superadmin"
 * - "user" → "user" (no change)
 * 
 * Run this script once after deploying the updated role model:
 * node scripts/migrate-roles.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/User.js";
import { ROLES } from "../constants/roles.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/pfe-app";

const migrateRoles = async () => {
  try {
    console.log("🚀 Starting role migration...\n");
    
    // Connect to database
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // Step 1: Count existing "admin" users
    const adminCount = await User.countDocuments({ role: "admin" });
    console.log(`\n📊 Found ${adminCount} user(s) with role "admin"\n`);

    if (adminCount === 0) {
      console.log("✨ No users to migrate. All good!");
      await mongoose.disconnect();
      return;
    }

    // Step 2: Migrate "admin" to "superadmin"
    console.log(`🔄 Migrating ${adminCount} user(s) from "admin" to "${ROLES.SUPERADMIN}"...`);
    const result = await User.updateMany(
      { role: "admin" },
      { role: ROLES.SUPERADMIN }
    );

    console.log(`✅ Updated: ${result.modifiedCount} user(s)`);
    if (result.matchedCount !== result.modifiedCount) {
      console.warn(`⚠️  Warning: ${result.matchedCount - result.modifiedCount} user(s) could not be updated`);
    }

    // Step 3: Verify migration
    console.log("\n🔍 Verifying migration...");
    const superAdminCount = await User.countDocuments({ role: ROLES.SUPERADMIN });
    const remainingAdminCount = await User.countDocuments({ role: "admin" });

    console.log(`   - "${ROLES.SUPERADMIN}" users: ${superAdminCount}`);
    console.log(`   - "admin" users (legacy): ${remainingAdminCount}`);

    // Step 4: Display role distribution
    console.log("\n📈 Role distribution after migration:");
    const stats = await User.aggregate([
      {
        $group: {
          _id: "$role",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    for (const stat of stats) {
      console.log(`   - ${stat._id}: ${stat.count}`);
    }

    if (remainingAdminCount === 0 && superAdminCount === adminCount) {
      console.log("\n✨ Migration completed successfully!");
    } else {
      console.log("\n⚠️  Migration completed with warnings. Please review the results above.");
    }

  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("\n📪 Disconnected from MongoDB");
  }
};

// Run migration
migrateRoles().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

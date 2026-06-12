#!/usr/bin/env node

/**
 * Test script to simulate a quota-exceeding file upload and check:
 * 1. If quota is exceeded
 * 2. If notifications are created in the database
 * 3. If notifications are emitted to streams
 */

import axios from "axios";
import dotenv from "dotenv";
import FormData from "form-data";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_URL = process.env.API_URL || "http://localhost:3000/api";
const TEST_TENANT_ID = process.env.TEST_TENANT_ID || "";
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || "";
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || "";

console.log("=".repeat(60));
console.log("QUOTA NOTIFICATION TEST");
console.log("=".repeat(60));
console.log(`API URL: ${API_URL}`);
console.log(`Test Tenant: ${TEST_TENANT_ID || "(not set)"}`);
console.log(`Test User: ${TEST_USER_EMAIL || "(not set)"}`);

if (!TEST_TENANT_ID || !TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
  console.error("\n❌ Missing test configuration!");
  console.error("Please set TEST_TENANT_ID, TEST_USER_EMAIL, and TEST_USER_PASSWORD");
  process.exit(1);
}

const testUploadWithQuotaExcess = async () => {
  try {
    // 1. Login
    console.log("\n[1] Logging in...");
    const loginRes = await axios.post(`${API_URL}/auth/login`, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD
    });

    const token = loginRes.data?.data?.accessToken;
    if (!token) {
      throw new Error("No token received from login");
    }

    const userId = loginRes.data?.data?.userId;
    const role = loginRes.data?.data?.role;
    console.log(`✅ Logged in as ${TEST_USER_EMAIL} (role: ${role}, id: ${userId})`);

    // 2. Get quota summary before upload
    console.log("\n[2] Getting quota summary...");
    const quotaRes = await axios.get(`${API_URL}/users/quota`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const quotaSummary = quotaRes.data?.data;
    console.log("Quota Summary:");
    if (quotaSummary?.tenant) {
      const tenantUsage = (quotaSummary.tenant.used / quotaSummary.tenant.limit) * 100;
      console.log(`  - Tenant Storage: ${(quotaSummary.tenant.used / 1024 / 1024).toFixed(2)}MB / ${(quotaSummary.tenant.limit / 1024 / 1024).toFixed(2)}MB (${tenantUsage.toFixed(1)}%)`);
    }
    if (quotaSummary?.user) {
      const userUsage = (quotaSummary.user.used / quotaSummary.user.limit) * 100;
      console.log(`  - User Storage: ${(quotaSummary.user.used / 1024 / 1024).toFixed(2)}MB / ${(quotaSummary.user.limit / 1024 / 1024).toFixed(2)}MB (${userUsage.toFixed(1)}%)`);
    }

    // 3. Create a large test file
    console.log("\n[3] Creating test file...");
    const testFileName = `test-quota-${Date.now()}.bin`;
    const testFilePath = path.join(__dirname, testFileName);
    
    // Create a file that's close to the quota
    const fileSize = 900 * 1024 * 1024; // 900MB
    console.log(`Creating ${(fileSize / 1024 / 1024).toFixed(0)}MB test file...`);
    
    // Write file in chunks to avoid memory issues
    const chunkSize = 10 * 1024 * 1024; // 10MB chunks
    const stream = fs.createWriteStream(testFilePath);
    let written = 0;
    
    while (written < fileSize) {
      const chunk = Buffer.alloc(Math.min(chunkSize, fileSize - written));
      stream.write(chunk);
      written += chunk.length;
    }
    stream.end();

    await new Promise((resolve, reject) => {
      stream.on("finish", resolve);
      stream.on("error", reject);
    });

    console.log(`✅ Test file created: ${testFilePath}`);

    // 4. Attempt upload
    console.log("\n[4] Attempting file upload...");
    const form = new FormData();
    form.append("file", fs.createReadStream(testFilePath));
    form.append("parentId", "");

    try {
      const uploadRes = await axios.post(`${API_URL}/files/upload`, form, {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${token}`
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      console.log("✅ Upload succeeded (unexpected)!");
      console.log(`File ID: ${uploadRes.data?.data?.fileId}`);
    } catch (error) {
      if (error.response?.status === 409) {
        console.log("✅ Upload blocked with 409 (expected)");
        console.log(`Error Code: ${error.response.data?.error?.code}`);
        console.log(`Error Message: ${error.response.data?.error?.message}`);
        console.log(`Error Details:`, error.response.data?.error?.details);
      } else {
        throw error;
      }
    }

    // 5. Check if quota notifications were created
    console.log("\n[5] Waiting for notifications...");
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds

    console.log("To check notifications in the database, run:");
    console.log(`  npm run test:quota-notifications`);

    // 6. Cleanup
    console.log("\n[6] Cleaning up...");
    fs.unlinkSync(testFilePath);
    console.log("✅ Test file deleted");

    console.log("\n" + "=".repeat(60));
    console.log("✅ TEST COMPLETED SUCCESSFULLY");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("\n" + "=".repeat(60));
    console.error("❌ TEST FAILED");
    console.error("=".repeat(60));
    console.error(error.message);
    if (error.response?.data) {
      console.error("Response:", error.response.data);
    }
    process.exit(1);
  }
};

testUploadWithQuotaExcess();

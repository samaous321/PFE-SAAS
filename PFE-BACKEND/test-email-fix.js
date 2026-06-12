#!/usr/bin/env node

/**
 * 🧪 TEST SCRIPT: Email Notification Fix
 * Test the recipientEmail fix for file sharing
 *
 * Usage: node test-email-fix.js
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from './models/User.js';
import File from './models/File.js';
import { createShareLink } from './services/file.service.js';

dotenv.config();

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const log = {
  pass: (msg) => console.log(`${colors.green}✅${colors.reset} ${msg}`),
  fail: (msg) => console.log(`${colors.red}❌${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠️${colors.reset}  ${msg}`),
  info: (msg) => console.log(`${colors.blue}ℹ️${colors.reset}  ${msg}`),
  header: (msg) => console.log(`\n${colors.cyan}═══ ${msg} ═══${colors.reset}`),
  section: (msg) => console.log(`\n${colors.cyan}→ ${msg}${colors.reset}`)
};

async function testEmailFix() {
  try {
    log.header('Testing Email Notification Fix');

    // Connect to MongoDB
    log.section('Connecting to MongoDB');
    await mongoose.connect(process.env.MONGO_URI);
    log.pass('Connected to MongoDB');

    // Find test users
    log.section('Finding test users');
    const users = await User.find({}).limit(2).select('email name _id tenantId');
    if (users.length < 2) {
      log.fail('Need at least 2 users for testing. Please create users first.');
      return;
    }

    const user1 = users[0];
    const user2 = users[1];
    log.info(`User1: ${user1.email} (${user1.name})`);
    log.info(`User2: ${user2.email} (${user2.name})`);

    // Find a test file owned by user1
    log.section('Finding test file');
    const testFile = await File.findOne({
      ownerId: user1._id,
      tenantId: user1.tenantId
    }).select('_id filename originalName');

    if (!testFile) {
      log.fail('No test file found for user1. Please upload a file first.');
      return;
    }

    log.info(`Test file: ${testFile.filename} (${testFile.originalName})`);

    // Test 1: Direct share (user1 to user2) - should fetch user2's email automatically
    log.section('Test 1: Direct share (user1 → user2)');
    try {
      const result1 = await createShareLink(testFile._id, {
        userId: user1._id,
        tenantId: user1.tenantId,
        ipAddress: '127.0.0.1',
        userAgent: 'Test Script'
      }, {
        recipientUserId: user2._id,
        accessControl: 'recipient-only',
        note: 'Test direct share',
        subject: 'Test Subject',
        notifyRecipient: true
      });

      log.pass('Direct share created successfully');
      log.info(`Share URL: ${result1.shareUrl}`);
      log.info(`Recipient email should be: ${user2.email}`);

    } catch (error) {
      log.fail(`Direct share failed: ${error.message}`);
    }

    // Test 2: Public link share - should not require recipientEmail
    log.section('Test 2: Public link share');
    try {
      const result2 = await createShareLink(testFile._id, {
        userId: user1._id,
        tenantId: user1.tenantId,
        ipAddress: '127.0.0.1',
        userAgent: 'Test Script'
      }, {
        accessControl: 'public',
        note: 'Test public share',
        subject: 'Test Public Subject',
        notifyRecipient: false // Don't send email for public shares
      });

      log.pass('Public link share created successfully');
      log.info(`Share URL: ${result2.shareUrl}`);

    } catch (error) {
      log.fail(`Public share failed: ${error.message}`);
    }

    // Test 3: Direct share with explicit recipientEmail
    log.section('Test 3: Direct share with explicit email');
    try {
      const result3 = await createShareLink(testFile._id, {
        userId: user1._id,
        tenantId: user1.tenantId,
        ipAddress: '127.0.0.1',
        userAgent: 'Test Script'
      }, {
        recipientEmail: 'test@example.com',
        accessControl: 'recipient-only',
        note: 'Test with explicit email',
        subject: 'Test Explicit Email',
        notifyRecipient: true
      });

      log.pass('Direct share with explicit email created successfully');
      log.info(`Share URL: ${result3.shareUrl}`);

    } catch (error) {
      log.fail(`Explicit email share failed: ${error.message}`);
    }

    log.header('Test Summary');
    log.info('All tests completed. Check server logs for email sending status.');

  } catch (error) {
    log.fail(`Test failed: ${error.message}`);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    log.info('Disconnected from MongoDB');
  }
}

testEmailFix();
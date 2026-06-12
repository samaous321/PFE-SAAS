#!/usr/bin/env node

/**
 * 🔍 DIAGNOSTIC SCRIPT
 * Test all connections: ClamAV, Redis, VirusTotal, MongoDB
 * 
 * Usage: node test-connections.js
 */

import dotenv from 'dotenv';
import fetch from 'node-fetch';
import net from 'net';
import redis from 'redis';
import mongoose from 'mongoose';

dotenv.config();

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
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

let allPassed = true;

// Test 1: ClamAV Connection
const testClamAV = async () => {
  log.header('ClamAV Daemon Test');
  
  const host = process.env.CLAMAV_HOST || '10.111.49.202';
  const port = parseInt(process.env.CLAMAV_PORT || 3310);

  log.info(`Testing: ${host}:${port}`);

  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: 5000 });

    socket.on('connect', () => {
      log.pass(`Connected to ClamAV daemon on ${host}:${port}`);
      socket.destroy();
      resolve(true);
    });

    socket.on('error', (err) => {
      log.fail(`Cannot connect to ClamAV: ${err.message}`);
      log.warn(`Make sure ClamAV is running on the VM:`);
      log.warn(`  SSH to VM: ssh user@${host}`);
      log.warn(`  Check: sudo systemctl status clamav-daemon`);
      log.warn(`  Start: sudo systemctl start clamav-daemon`);
      log.warn(`  Update: sudo freshclam`);
      allPassed = false;
      resolve(false);
    });

    socket.on('timeout', () => {
      log.fail(`Connection timeout to ClamAV (${host}:${port})`);
      log.warn(`This could mean:`);
      log.warn(`  1. ClamAV is not running`);
      log.warn(`  2. Firewall is blocking port ${port}`);
      log.warn(`  3. Network connectivity issue`);
      socket.destroy();
      allPassed = false;
      resolve(false);
    });
  });
};

// Test 2: Redis Connection
const testRedis = async () => {
  log.header('Redis Connection Test');
  
  const redisUrl = process.env.REDIS_URL || 'redis://10.111.49.202:6379';
  log.info(`Testing: ${redisUrl}`);

  try {
    const client = redis.createClient({
      url: redisUrl,
      socket: { reconnectStrategy: () => false }
    });

    client.on('error', (err) => {
      throw err;
    });

    await client.connect();
    const pong = await client.ping();
    
    log.pass(`Connected to Redis`);
    log.info(`Ping response: ${pong}`);
    
    // Test set/get
    await client.set('test-key', 'test-value');
    const value = await client.get('test-key');
    
    if (value === 'test-value') {
      log.pass(`Set/Get operations working`);
    } else {
      throw new Error('Set/Get test failed');
    }

    await client.disconnect();
    return true;
  } catch (error) {
    log.fail(`Redis connection failed: ${error.message}`);
    log.warn(`Make sure Redis is running on the VM:`);
    log.warn(`  SSH to VM: ssh user@10.111.49.202`);
    log.warn(`  Check: sudo systemctl status redis-server`);
    log.warn(`  Start: sudo systemctl start redis-server`);
    allPassed = false;
    return false;
  }
};

// Test 3: VirusTotal API
const testVirusTotal = async () => {
  log.header('VirusTotal API Test');
  
  const apiKey = process.env.VIRUSTOTAL_API_KEY;

  if (!apiKey) {
    log.fail('VIRUSTOTAL_API_KEY not set in .env');
    log.warn('Get your API key from: https://www.virustotal.com/gui/my-apikey');
    allPassed = false;
    return false;
  }

  log.info(`Testing with API key: ${apiKey.substring(0, 10)}...`);

  try {
    const response = await fetch('https://www.virustotal.com/api/v3/user', {
      headers: { 'x-apikey': apiKey }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    log.pass(`Connected to VirusTotal API`);
    log.info(`Tier: ${data.data?.attributes?.tier || 'Free'}`);
    log.info(`Email: ${data.data?.attributes?.email || 'N/A'}`);

    return true;
  } catch (error) {
    log.fail(`VirusTotal API error: ${error.message}`);
    log.warn(`Solutions:`);
    log.warn(`  1. Check API key at: https://www.virustotal.com/gui/my-apikey`);
    log.warn(`  2. Set in .env: VIRUSTOTAL_API_KEY=your_key`);
    log.warn(`  3. Restart backend: npm start`);
    allPassed = false;
    return false;
  }
};

// Test 4: MongoDB Connection
const testMongoDB = async () => {
  log.header('MongoDB Connection Test');
  
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/secure_saas';
  log.info(`Testing: ${mongoUri}`);

  try {
    await mongoose.connect(mongoUri, {
      connectTimeoutMS: 5000,
      socketTimeoutMS: 5000
    });

    log.pass(`Connected to MongoDB`);
    log.info(`Database: ${mongoose.connection.name}`);

    // Test a query
    const admin = mongoose.connection.admin();
    const status = await admin.ping();
    
    if (status) {
      log.pass(`Ping successful`);
    }

    await mongoose.disconnect();
    return true;
  } catch (error) {
    log.fail(`MongoDB connection failed: ${error.message}`);
    log.warn(`Solutions:`);
    log.warn(`  1. Check MongoDB is running: mongosh`);
    log.warn(`  2. Verify URI in .env: MONGO_URI=mongodb://localhost:27017/secure_saas`);
    log.warn(`  3. Check network connectivity`);
    allPassed = false;
    return false;
  }
};

// Test 5: Environment Variables
const testEnvVars = () => {
  log.header('Environment Variables Check');

  const required = [
    'JWT_SECRET',
    'MASTER_KEY',
    'VIRUSTOTAL_API_KEY',
    'CLAMAV_HOST',
    'CLAMAV_PORT',
    'REDIS_URL',
    'MONGO_URI'
  ];

  let envOk = true;
  required.forEach(varName => {
    if (process.env[varName]) {
      const val = varName === 'JWT_SECRET' || varName === 'MASTER_KEY'
        ? '*'.repeat(process.env[varName].length)
        : process.env[varName];
      log.pass(`${varName} = ${val}`);
    } else {
      log.fail(`${varName} is NOT set`);
      envOk = false;
      allPassed = false;
    }
  });

  return envOk;
};

// Main test runner
const runTests = async () => {
  console.log(`
${colors.cyan}╔════════════════════════════════════════╗${colors.reset}
${colors.cyan}║  🔍 SECURITY INFRASTRUCTURE DIAGNOSTICS  ║${colors.reset}
${colors.cyan}╚════════════════════════════════════════╝${colors.reset}
  `);

  log.section('Step 1: Environment Variables');
  testEnvVars();

  log.section('Step 2: ClamAV Connection');
  await testClamAV();

  log.section('Step 3: Redis Connection');
  await testRedis();

  log.section('Step 4: VirusTotal API');
  await testVirusTotal();

  log.section('Step 5: MongoDB Connection');
  await testMongoDB();

  // Final result
  console.log(`\n${colors.cyan}════════════════════════════════════════${colors.reset}`);
  if (allPassed) {
    console.log(`${colors.green}✅ ALL SYSTEMS OPERATIONAL - READY FOR UPLOAD!${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`${colors.red}❌ SOME SYSTEMS FAILED - FIX ISSUES ABOVE${colors.reset}\n`);
    process.exit(1);
  }
};

// Run
runTests().catch(err => {
  console.error(err);
  process.exit(1);
});

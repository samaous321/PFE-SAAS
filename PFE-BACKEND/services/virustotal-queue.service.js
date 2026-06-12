import Queue from "bull";
import * as vtService from "./virustotal.service.js";
import File from "../models/File.js";

/**
 * VIRUSTOTAL QUEUE SERVICE
 * 
 * Manage async VirusTotal scanning via Bull queue
 * 
 * Why Queue?
 * - VT has rate limits (4 req/min free, 1000/hr paid)
 * - Don't want to block upload waiting for VT
 * - Retry failed scans automatically
 * - Process scans in background
 * 
 * Storage Options:
 * - Redis: Recommended for production (persistent queue)
 * - Memory: Fine for development (queue lost on restart)
 */

// ⚠️  IMPORTANT: Use functions, not constants!
// Because they're evaluated at import time, before dotenv.config() runs.
const DEFAULT_REDIS_HOST = "192.168.61.25";
const DEFAULT_REDIS_PORT = 6379;
const DEFAULT_QUEUE_CONNECT_TIMEOUT_MS = 10000;

const getRedisUrl = () =>
  process.env.REDIS_URL || `redis://${DEFAULT_REDIS_HOST}:${DEFAULT_REDIS_PORT}`;

const getRedisConfig = () => {
  try {
    const parsed = new URL(getRedisUrl());
    const db = parsed.pathname?.replace(/^\//, "");

    return {
      host: parsed.hostname || DEFAULT_REDIS_HOST,
      port: parsed.port ? Number(parsed.port) : DEFAULT_REDIS_PORT,
      db: db ? Number(db) || 0 : undefined,
      username: parsed.username || undefined,
      password: parsed.password || undefined,
      tls: parsed.protocol === "rediss:" ? {} : undefined
    };
  } catch {
    return {
      host: DEFAULT_REDIS_HOST,
      port: DEFAULT_REDIS_PORT
    };
  }
};

const getRedisHost = () => getRedisConfig().host;
const getRedisPort = () => getRedisConfig().port;

const getSafeRedisUrl = () => {
  try {
    const parsed = new URL(getRedisUrl());
    const authPrefix = parsed.username || parsed.password ? "***:***@" : "";
    const port = parsed.port ? `:${parsed.port}` : "";
    const db = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";

    return `${parsed.protocol}//${authPrefix}${parsed.hostname}${port}${db}`;
  } catch {
    return getRedisUrl();
  }
};

const waitForRedisClient = async (
  client,
  timeoutMs = DEFAULT_QUEUE_CONNECT_TIMEOUT_MS
) => {
  if (client.status === "ready") {
    return;
  }

  await new Promise((resolve, reject) => {
    let lastError = null;
    let settled = false;

    const cleanup = () => {
      clearTimeout(timeout);
      client.removeListener("ready", handleReady);
      client.removeListener("error", handleError);
      client.removeListener("end", handleEnd);
    };

    const finish = (callback) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      callback();
    };

    const handleReady = () => finish(resolve);
    const handleError = (error) => {
      lastError = error;
    };
    const handleEnd = () => {
      finish(() => {
        reject(lastError || new Error("Redis connection ended before ready"));
      });
    };

    const timeout = setTimeout(() => {
      finish(() => {
        reject(
          lastError ||
            new Error(`Queue connection timeout after ${timeoutMs}ms`)
        );
      });
    }, timeoutMs);

    client.once("ready", handleReady);
    client.on("error", handleError);
    client.once("end", handleEnd);
  });
};

const getQueueOptions = () => ({
  redis: {
    ...getRedisConfig(),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    enableOfflineQueue: true,
    connectTimeout: DEFAULT_QUEUE_CONNECT_TIMEOUT_MS,
    retryStrategy: (times) => Math.min(times * 50, 2000)
  },
  settings: {
    maxStalledCount: 2,
    lockRenewTime: 30000,
    lockDuration: 30000
  },
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 2000
    },
    removeOnComplete: {
      age: 3600
    },
    removeOnFail: {
      age: 86400
    },
    timeout: 120000
  }
});

let vtQueue = null;

/**
 * Initialize the Queue
 */
export const initQueueVT = async () => {
  if (vtQueue) {
    return vtQueue;
  }

  try {
    const redisUrl = getRedisUrl();
    const queueOptions = getQueueOptions();

    if (!process.env.REDIS_URL) {
      console.warn("⚠️  REDIS_URL not set - Queue might use in-memory mode");
      console.warn("    Configure REDIS_URL in .env: REDIS_URL=redis://host:6379");
    }

    console.log(`[VT Queue] Connecting to Redis: ${getSafeRedisUrl()}`);
    
    vtQueue = new Queue("virustotal-scans", redisUrl, queueOptions);

    await vtQueue.isReady();
    await waitForRedisClient(
      vtQueue.client,
      queueOptions.redis.connectTimeout || DEFAULT_QUEUE_CONNECT_TIMEOUT_MS
    );

    // Process jobs: scan file with VT
    vtQueue.process(async (job) => {
      return await processVTScan(job);
    });

    // Event: Job started
    vtQueue.on("active", (job) => {
      console.log(`[VT Queue] Processing job: ${job.id} - File: ${job.data.fileId}`);
    });

    // Event: Job completed
    vtQueue.on("completed", (job, result) => {
      console.log(
        `[VT Queue] ✅ Completed job: ${job.id} - Result: ${result.isInfected ? "INFECTED" : "CLEAN"}`
      );
    });

    // Event: Job failed
    vtQueue.on("failed", (job, error) => {
      console.error(
        `[VT Queue] ❌ Failed job: ${job.id} (attempt ${job.attemptsMade}/${job.opts.attempts})`
      );
      console.error(`    Error: ${error.message}`);
      console.error(`    File ID: ${job.data.fileId}`);
    });

    // Event: Job stalled
    vtQueue.on("stalled", (jobId) => {
      console.warn(`[VT Queue] ⚠️  Job stalled: ${jobId}`);
    });

    // Event: Queue drained
    vtQueue.on("drained", () => {
      console.log("[VT Queue] ✅ All jobs processed");
    });

    console.log("✅ VT Queue initialized successfully");
    return vtQueue;
  } catch (error) {
    console.error("❌ Failed to initialize VT Queue:", error.message);
    const failedQueue = vtQueue;

    if (failedQueue) {
      try {
        await failedQueue.close();
      } catch {
        // Best effort cleanup after a failed initialization attempt.
      }
    }

    vtQueue = null;

    console.error("[VT Queue Debug]", {
      redisUrl: getSafeRedisUrl(),
      env_REDIS_URL: process.env.REDIS_URL,
      env_CLAMAV_HOST: process.env.CLAMAV_HOST,
      redisHost: getRedisHost(),
      redisPort: getRedisPort(),
      redisClientStatus: failedQueue?.client?.status || null
    });
    throw error;
  }
};

/**
 * Add file to VT scanning queue
 * Called after ClamAV scan (if result is CLEAN or SUSPICIOUS)
 */
export const queueFileForVTScan = async (fileId, filePath, filename) => {
  try {
    if (!vtQueue) {
      await initQueueVT();
    }

    const job = await vtQueue.add(
      {
        fileId,
        filePath,
        filename,
        queuedAt: new Date()
      },
      {
        jobId: `vt-${fileId}` // Unique job ID per file
      }
    );

    console.log(
      `[VT Queue] ✅ Queued file for VT scan: ${filename} (Job: ${job.id})`
    );
    return job;
  } catch (error) {
    console.error("[VT Queue] Error queueing file:", error.message);
    throw error;
  }
};

/**
 * Process a VT scan job (internal)
 */
async function processVTScan(job) {
  const { fileId, filePath, filename } = job.data;

  try {
    console.log(`[VT Queue] Starting VT scan for: ${filename}`);

    // Call VT API
    const vtResult = await vtService.scanFileWithVT(filePath, filename);

    // Update File metadata with VT results
    const infected = Boolean(vtResult.isInfected);
    const vtVirusNames = Array.isArray(vtResult.viruses)
      ? vtResult.viruses
          .map((virus) => {
            if (typeof virus === "string") return virus;
            if (virus?.name) return virus.name;
            if (virus?.engine) return `${virus.engine}:detected`;
            return null;
          })
          .filter(Boolean)
      : [];

    await File.findByIdAndUpdate(
      fileId,
      {
        scanStatus: infected ? "infected" : "clean",
        scannedAt: new Date(),
        scanViruses: vtVirusNames,
        status: infected ? "blocked" : "active",
        "scanMetadata.quarantineStatus": infected ? "quarantined" : "clean",
        "scanMetadata.lastScannedAt": new Date(),
        "scanMetadata.virustotalResult": {
          isInfected: vtResult.isInfected,
          engine: vtResult.engine,
          stats: vtResult.stats,
          detectionRatio: vtResult.detectionRatio,
          timestamp: new Date(),
          viruses: vtResult.viruses
        }
      },
      { returnDocument: "after" }
    );

    // Return result to queue
    return {
      fileId,
      isInfected: vtResult.isInfected,
      viruses: vtResult.viruses,
      engine: "virustotal",
      timestamp: new Date()
    };
  } catch (error) {
    console.error(`[VT Queue] Error scanning file ${filename}:`, error.message);
    throw error; // Will trigger retry
  }
}

/**
 * Get queue stats
 */
export const getQueueStats = async () => {
  try {
    if (!vtQueue) {
      return null;
    }

    const counts = await vtQueue.getJobCounts();
    const info = {
      waiting: counts.waiting,
      active: counts.active,
      completed: counts.completed,
      failed: counts.failed,
      delayed: counts.delayed,
      total: counts.waiting + counts.active + counts.completed + counts.failed
    };

    return info;
  } catch (error) {
    console.error("Error getting queue stats:", error.message);
    return null;
  }
};

/**
 * Get pending jobs
 */
export const getPendingJobs = async () => {
  try {
    if (!vtQueue) {
      return [];
    }

    const jobs = await vtQueue.getJobs(["waiting", "active", "delayed"]);
    return await Promise.all(jobs.map(async (job) => ({
      id: job.id,
      fileId: job.data.fileId,
      filename: job.data.filename,
      state: await job.getState(),
      progress: job.progress(),
      attempts: job.attemptsMade
    })));
  } catch (error) {
    console.error("Error getting pending jobs:", error.message);
    return [];
  }
};

/**
 * Clean up queue (remove completed jobs)
 */
export const cleanupQueue = async () => {
  try {
    if (!vtQueue) return;

    const count = await vtQueue.clean(3600 * 1000, "completed"); // Remove completed jobs older than 1 hour
    console.log(`[VT Queue] Cleaned up ${count} completed jobs`);
  } catch (error) {
    console.error("Error cleaning queue:", error.message);
  }
};

/**
 * Close queue connection
 */
export const closeQueueVT = async () => {
  try {
    if (vtQueue) {
      await vtQueue.close();
      vtQueue = null;
      console.log("✅ VT Queue closed");
    }
  } catch (error) {
    console.error("Error closing queue:", error.message);
  }
};

export default {
  initQueueVT,
  queueFileForVTScan,
  getQueueStats,
  getPendingJobs,
  cleanupQueue,
  closeQueueVT
};

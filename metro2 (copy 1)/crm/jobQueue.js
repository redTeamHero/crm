import BullMQ from "bullmq";
import IORedis from "ioredis";
import crypto from "crypto";
import EventEmitter from "events";
import { logError, logInfo, logWarn } from "./logger.js";

const { Queue, Worker } = BullMQ;

const DEFAULT_CONCURRENCY = Number.parseInt(process.env.JOB_WORKER_CONCURRENCY || "2", 10) || 2;

function buildRedisConfig() {
  const url = process.env.REDIS_URL || process.env.REDIS_TLS_URL;
  if (url) {
    return { url, maxRetriesPerRequest: null };
  }
  const host = process.env.REDIS_HOST || process.env.REDIS_HOSTNAME;
  if (!host) return null;
  const port = Number.parseInt(process.env.REDIS_PORT || "6379", 10) || 6379;
  const password = process.env.REDIS_PASSWORD || undefined;
  const enableTLS = String(process.env.REDIS_TLS || "false").toLowerCase() === "true";
  const tls = enableTLS ? { rejectUnauthorized: false } : undefined;
  return {
    host,
    port,
    password,
    tls,
    maxRetriesPerRequest: null,
  };
}

const connectionConfig = buildRedisConfig();
let connection = null;
let queueEnabled = false;

if (connectionConfig) {
  try {
    if (connectionConfig.url) {
      connection = new IORedis(connectionConfig.url, { maxRetriesPerRequest: connectionConfig.maxRetriesPerRequest });
    } else {
      connection = new IORedis(connectionConfig);
    }
    queueEnabled = true;
    connection.on("error", (err) => {
      logWarn("QUEUE_CONNECTION_ERROR", err?.message || "Redis connection error");
    });
    connection.on("connect", () => {
      logInfo("QUEUE_CONNECTION_READY", "Redis connection established");
    });
  } catch (err) {
    queueEnabled = false;
    connection = null;
    logWarn("QUEUE_DISABLED", err?.message || "Failed to initialize Redis connection");
  }
} else {
  logWarn("QUEUE_DISABLED", "Redis connection details missing; falling back to in-process jobs");
}

const queues = new Map();
const workers = new Map();
const processors = new Map();
const localEmitter = new EventEmitter();
const normalizationWarnings = new Set();

function normalizeQueueName(name) {
  return String(name).replace(/:/g, "_");
}

function warnIfQueueNameNormalized(originalName, normalizedName) {
  if (normalizedName === originalName) {
    return;
  }
  if (normalizationWarnings.has(normalizedName)) {
    return;
  }
  normalizationWarnings.add(normalizedName);
  logWarn("QUEUE_NAME_NORMALIZED", `Queue name "${originalName}" normalized to "${normalizedName}"`);
}

function ensureQueue(name) {
  if (name.includes(":")) {
    throw new Error(`Invalid queue name "${name}". Use "_" or "-" instead of ":"`);
  }
  if (!queues.has(name) && queueEnabled && connection) {
    const queue = new Queue(name, { connection });
    queues.set(name, queue);
  }
  return queues.get(name) || null;
}

export function isQueueEnabled() {
  return queueEnabled;
}

export function getQueueConnectionOptions() {
  return connectionConfig ? { ...connectionConfig } : null;
}

export function registerJobProcessor(name, handler, options = {}) {
  const normalizedName = normalizeQueueName(name);
  warnIfQueueNameNormalized(name, normalizedName);
  processors.set(normalizedName, handler);
  if (!queueEnabled || !connection) {
    return;
  }
  if (workers.has(normalizedName)) {
    return;
  }
  ensureQueue(normalizedName);
  const worker = new Worker(
    normalizedName,
    async (job) => {
      return handler(job.data, job);
    },
    {
      connection,
      concurrency: Number.parseInt(options.concurrency, 10) || DEFAULT_CONCURRENCY,
    },
  );
  worker.on("failed", (job, err) => {
    logError("QUEUE_JOB_FAILED", "Background job failed", err, {
      queue: normalizedName,
      jobId: job?.id,
      attempts: job?.attemptsMade,
    });
  });
  worker.on("error", (err) => {
    logError("QUEUE_WORKER_ERROR", "Worker error", err, { queue: normalizedName });
  });
  workers.set(normalizedName, worker);
}

export async function enqueueJob(name, data, options = {}) {
  const normalizedName = normalizeQueueName(name);
  warnIfQueueNameNormalized(name, normalizedName);
  const jobId = options.jobId || crypto.randomUUID();
  if (queueEnabled && connection) {
    const queue = ensureQueue(normalizedName);
    if (!queue) {
      throw new Error(`Queue ${normalizedName} unavailable`);
    }
    await queue.add(normalizedName, data, {
      jobId,
      attempts: Number.parseInt(options.attempts, 10) || 1,
      removeOnComplete: true,
      removeOnFail: true,
      backoff: options.backoff || { type: "exponential", delay: 1000 },
    });
    return { id: jobId };
  }

  const processor = processors.get(normalizedName);
  if (!processor) {
    throw new Error(`No processor registered for queue ${normalizedName}`);
  }
  const fakeJob = {
    id: jobId,
    name: normalizedName,
    data,
    attemptsMade: 0,
  };
  setImmediate(async () => {
    try {
      await processor(data, fakeJob);
      localEmitter.emit(`job:${jobId}:completed`);
    } catch (err) {
      localEmitter.emit(`job:${jobId}:failed`, err);
      logError("QUEUE_FALLBACK_JOB_FAILED", "Job failed in in-process queue", err, {
        queue: normalizedName,
        jobId,
      });
    }
  });
  return { id: jobId };
}

export async function shutdownQueues() {
  const shuttingDown = [];
  for (const worker of workers.values()) {
    shuttingDown.push(worker.close().catch(() => {}));
  }
  for (const queue of queues.values()) {
    shuttingDown.push(queue.close().catch(() => {}));
  }
  if (connection) {
    shuttingDown.push(connection.quit().catch(() => {}));
  }
  await Promise.all(shuttingDown);
  queues.clear();
  workers.clear();
  processors.clear();
}

export { localEmitter };

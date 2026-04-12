import { Queue } from "bullmq";

function getRedisOptions() {
  const redisUrl = process.env.REDIS_URL || null;
  if (redisUrl) return { connection: redisUrl };

  const host = process.env.REDIS_HOST || "127.0.0.1";
  const port = Number(process.env.REDIS_PORT || 6379);
  const password = process.env.REDIS_PASSWORD || undefined;
  return { connection: { host, port, password } };
}

export const uploadQueue = new Queue("upload-processing", getRedisOptions());

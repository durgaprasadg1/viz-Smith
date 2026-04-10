import { createClient } from "redis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

const redisClient = createClient({
  url: redisUrl,
});

redisClient.on("error", (err) => {
  console.error("Redis Error:", err.message);
});

let isConnected = false;

function toPositiveInt(value, fallback = 600) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

const defaultTtl = toPositiveInt(process.env.CACHE_TTL_SECONDS, 600);

export const CACHE_TTL_SECONDS = {
  dashboard: toPositiveInt(process.env.CACHE_TTL_DASHBOARD_SECONDS, defaultTtl),
  history: toPositiveInt(process.env.CACHE_TTL_HISTORY_SECONDS, defaultTtl),
  dataset: toPositiveInt(process.env.CACHE_TTL_DATASET_SECONDS, defaultTtl),
};

export async function connectRedis() {
  try {
    if (!isConnected) {
      await redisClient.connect();
      isConnected = true;
      console.log("Redis Connected");
    }
  } catch (error) {
    console.error("Redis Connection Failed:", error.message);
  }
}

export async function getJsonCache(key) {
  try {
    if (!isConnected) await connectRedis();

    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error(`Redis GET Error [${key}]:`, error.message);
    return null;
  }
}

export async function setJsonCache(key, value, ttlSeconds = defaultTtl) {
  try {
    if (!isConnected) await connectRedis();
    if (value === undefined) return false;

    await redisClient.setEx(
      key,
      toPositiveInt(ttlSeconds, defaultTtl),
      JSON.stringify(value),
    );
    return true;
  } catch (error) {
    console.error(`Redis SET Error [${key}]:`, error.message);
    return false;
  }
}

export async function deleteCacheKeys(keys = []) {
  try {
    if (!isConnected) await connectRedis();
    const normalized = [...new Set((keys || []).filter(Boolean))];
    if (!normalized.length) return 0;

    return await redisClient.del(normalized);
  } catch (error) {
    console.error("Redis DELETE Error:", error.message);
    return 0;
  }
}

export function getDashboardCacheKey(userId) {
  return `dashboard:${userId}`;
}

export function getHistoryCacheKey(userId) {
  return `history:${userId}`;
}

export function getDatasetCacheKey(userId, datasetId) {
  return `dataset:${userId}:${datasetId}`;
}

export async function invalidateUserDatasetCaches({ userId, datasetIds = [] }) {
  if (!userId) return 0;

  const keys = [getDashboardCacheKey(userId), getHistoryCacheKey(userId)];

  (datasetIds || [])
    .filter(Boolean)
    .forEach((datasetId) => keys.push(getDatasetCacheKey(userId, datasetId)));

  return deleteCacheKeys(keys);
}

export default redisClient;

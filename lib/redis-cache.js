import { createClient } from "redis";

const CACHE_PREFIX = "vizsmith:v1";
const FALLBACK_TTL_SECONDS = 300;

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

const defaultTtl = toPositiveInt(
  process.env.CACHE_TTL_SECONDS,
  FALLBACK_TTL_SECONDS,
);

export const CACHE_TTL_SECONDS = {
  dashboard: toPositiveInt(process.env.CACHE_TTL_DASHBOARD_SECONDS, defaultTtl),
  history: toPositiveInt(process.env.CACHE_TTL_HISTORY_SECONDS, defaultTtl),
  dataset: toPositiveInt(process.env.CACHE_TTL_DATASET_SECONDS, defaultTtl),
};

let redisClient;
let connectPromise;
let warnedMissingRedis = false;

function normalizeCachePart(value) {
  return encodeURIComponent(String(value));
}

function buildCacheKey(parts) {
  return [CACHE_PREFIX, ...parts.map(normalizeCachePart)].join(":");
}

function logRedisError(scope, error) {
  const message = error?.message || String(error);
  console.error(`[redis-cache] ${scope}: ${message}`);
}

async function getRedisClient() {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    if (!warnedMissingRedis) {
      warnedMissingRedis = true;
      console.warn(
        "[redis-cache] REDIS_URL is not set. Redis cache is bypassed.",
      );
    }
    return null;
  }

  if (!redisClient) {
    redisClient = createClient({ url: redisUrl });
    redisClient.on("error", (error) => {
      logRedisError("client", error);
    });
  }

  if (redisClient.isOpen) {
    return redisClient;
  }

  if (!connectPromise) {
    connectPromise = redisClient.connect().catch((error) => {
      connectPromise = null;
      logRedisError("connect", error);
      return null;
    });
  }

  await connectPromise;
  connectPromise = null;

  if (!redisClient.isOpen) {
    return null;
  }

  return redisClient;
}

export function getDashboardCacheKey(userId) {
  return buildCacheKey(["user", userId, "dashboard"]);
}

export function getHistoryCacheKey(userId) {
  return buildCacheKey(["user", userId, "history"]);
}

export function getDatasetCacheKey(userId, datasetId) {
  return buildCacheKey(["user", userId, "dataset", datasetId]);
}

export async function getCachedJson(key) {
  const client = await getRedisClient();
  if (!client) return null;

  try {
    const raw = await client.get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    logRedisError(`get ${key}`, error);
    return null;
  }
}

export async function setCachedJson(key, value, ttlSeconds = defaultTtl) {
  if (value === undefined) return false;

  const client = await getRedisClient();
  if (!client) return false;

  try {
    await client.set(key, JSON.stringify(value), {
      EX: toPositiveInt(ttlSeconds, defaultTtl),
    });
    // console.log("Set to Cache")
    return true;
  } catch (error) {
    logRedisError(`set ${key}`, error);
    return false;
  }
}

export async function getOrSetCachedJson({
  key,
  ttlSeconds,
  loader,
  forceRefresh = false,
}) {
  if (typeof loader !== "function") {
    throw new Error("getOrSetCachedJson loader must be a function");
  }

  if (!forceRefresh) {
    const cached = await getCachedJson(key);
    if (cached !== null) {
    //   console.log("From Redis");
      return {
        value: cached,
        cacheStatus: "HIT",
      };
    }
  }

  const freshValue = await loader();
  await setCachedJson(key, freshValue, ttlSeconds);

  return {
    value: freshValue,
    cacheStatus: forceRefresh ? "BYPASS" : "MISS",
  };
}

export async function deleteCachedKeys(keys) {
  const normalized = [...new Set((keys || []).filter(Boolean))];
  if (!normalized.length) return 0;

  const client = await getRedisClient();
  if (!client) return 0;

  let deletedCount = 0;

  for (const key of normalized) {
    try {
      deletedCount += await client.del(key);
    } catch (error) {
      logRedisError(`del ${key}`, error);
    }
  }

  return deletedCount;
}

export async function invalidateUserDatasetCaches({ userId, datasetIds = [] }) {
  if (!userId) return 0;

  const keys = [getDashboardCacheKey(userId), getHistoryCacheKey(userId)];

  datasetIds
    .filter(Boolean)
    .forEach((datasetId) => keys.push(getDatasetCacheKey(userId, datasetId)));

  return deleteCachedKeys(keys);
}

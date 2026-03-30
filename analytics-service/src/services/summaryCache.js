const DEFAULT_TTL_SECONDS = Math.max(5, Number(process.env.ANALYTICS_SUMMARY_CACHE_TTL_SECONDS || 30));
const CACHE_NAMESPACE = String(process.env.ANALYTICS_CACHE_NAMESPACE || "analytics:cache:").trim();

const memoryCache = new Map();
let redisClient = null;
let redisEnabled = false;
let redisBootstrapPromise = null;

function namespacedKey(key) {
  return `${CACHE_NAMESPACE}${key}`;
}

function pruneExpired() {
  const now = Date.now();
  for (const [key, entry] of memoryCache.entries()) {
    if (entry.expiresAt <= now) {
      memoryCache.delete(key);
    }
  }
}

function getMemoryValue(key) {
  pruneExpired();
  const entry = memoryCache.get(key);
  return entry ? entry.value : null;
}

function setMemoryValue(key, value, ttlSeconds = DEFAULT_TTL_SECONDS) {
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

function hasRedisConnection() {
  return Boolean(redisEnabled && redisClient?.isOpen);
}

async function bootstrapRedis() {
  const redisUrl = String(process.env.REDIS_URL || "").trim();
  if (!redisUrl) {
    return;
  }

  try {
    const { createClient } = require("redis");
    redisClient = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (attempts) => Math.min(attempts * 100, 2000),
      },
    });

    redisClient.on("error", (error) => {
      if (redisEnabled) {
        console.warn("Analytics cache Redis disconnected, falling back to memory:", error.message);
      }
      redisEnabled = false;
    });

    await redisClient.connect();
    redisEnabled = true;
    console.log("Analytics cache connected to Redis");
  } catch (error) {
    redisEnabled = false;
    redisClient = null;
    console.warn("Analytics cache using memory fallback:", error.message);
  }
}

redisBootstrapPromise = bootstrapRedis();

async function get(key) {
  const localValue = getMemoryValue(key);
  if (localValue !== null) {
    return localValue;
  }

  await redisBootstrapPromise;
  if (!hasRedisConnection()) {
    return null;
  }

  const rawValue = await redisClient.get(namespacedKey(key));
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    setMemoryValue(key, parsed);
    return parsed;
  } catch (_error) {
    return null;
  }
}

async function set(key, value, ttlSeconds = DEFAULT_TTL_SECONDS) {
  setMemoryValue(key, value, ttlSeconds);

  await redisBootstrapPromise;
  if (!hasRedisConnection()) {
    return;
  }

  await redisClient.set(namespacedKey(key), JSON.stringify(value), {
    EX: ttlSeconds,
  });
}

async function del(key) {
  memoryCache.delete(key);

  await redisBootstrapPromise;
  if (!hasRedisConnection()) {
    return;
  }

  await redisClient.del(namespacedKey(key));
}

async function clear() {
  memoryCache.clear();

  await redisBootstrapPromise;
  if (!hasRedisConnection()) {
    return;
  }

  const keyPrefix = namespacedKey("");
  const matchedKeys = await redisClient.keys(`${keyPrefix}*`);
  if (matchedKeys.length) {
    await redisClient.del(matchedKeys);
  }
}

module.exports = {
  get,
  set,
  del,
  clear,
};

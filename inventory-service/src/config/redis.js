const DEFAULT_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS || 60);

const memoryCache = new Map();
let redisClient = null;
let redisEnabled = false;

function removeExpiredMemoryEntries() {
  const now = Date.now();
  for (const [key, value] of memoryCache.entries()) {
    if (value.expiresAt <= now) {
      memoryCache.delete(key);
    }
  }
}

function getMemoryValue(key) {
  removeExpiredMemoryEntries();
  const entry = memoryCache.get(key);
  if (!entry) {
    return null;
  }
  return entry.value;
}

function setMemoryValue(key, value, ttlSeconds = DEFAULT_TTL_SECONDS) {
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

async function bootstrapRedis() {
  const redisUrl = process.env.REDIS_URL;
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
        console.warn("Redis cache disconnected, falling back to memory cache:", error.message);
      }
      redisEnabled = false;
    });

    await redisClient.connect();
    redisEnabled = true;
    console.log("Inventory cache connected to Redis");
  } catch (error) {
    redisEnabled = false;
    redisClient = null;
    console.warn("Redis unavailable, using in-memory cache:", error.message);
  }
}

bootstrapRedis();

async function getJSON(key) {
  if (redisEnabled && redisClient?.isOpen) {
    const value = await redisClient.get(key);
    return value ? JSON.parse(value) : null;
  }
  return getMemoryValue(key);
}

async function setJSON(key, value, ttlSeconds = DEFAULT_TTL_SECONDS) {
  if (redisEnabled && redisClient?.isOpen) {
    await redisClient.set(key, JSON.stringify(value), {
      EX: ttlSeconds,
    });
    return;
  }
  setMemoryValue(key, value, ttlSeconds);
}

async function delKey(key) {
  if (redisEnabled && redisClient?.isOpen) {
    await redisClient.del(key);
    return;
  }
  memoryCache.delete(key);
}

async function delByPrefix(prefix) {
  if (redisEnabled && redisClient?.isOpen) {
    const matchedKeys = await redisClient.keys(`${prefix}*`);
    if (matchedKeys.length) {
      await redisClient.del(matchedKeys);
    }
    return;
  }

  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  }
}

module.exports = {
  getJSON,
  setJSON,
  delKey,
  delByPrefix,
};

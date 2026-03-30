require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { randomUUID } = require("node:crypto");
const { buildServiceRegistry } = require("./src/config/serviceRegistry");
const { gatewayAuth } = require("./src/middlewares/authMiddleware");
const cache = require("./src/services/cache");

const app = express();
const serviceRegistry = buildServiceRegistry();

const UPSTREAM_TIMEOUT_MS = Math.max(500, Number(process.env.GATEWAY_UPSTREAM_TIMEOUT_MS || 6000));
const FORWARD_RETRY_COUNT = Math.max(0, Number(process.env.GATEWAY_FORWARD_RETRY_COUNT || 2));
const CACHE_TTL_SECONDS = Math.max(5, Number(process.env.GATEWAY_CACHE_TTL_SECONDS || 15));

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(gatewayAuth);

function buildCacheKey(req) {
  const method = String(req.method || "GET").toUpperCase();
  const role = String(req.user?.role || "anonymous").trim().toLowerCase();
  return `${method}|${role}|${req.originalUrl}`;
}

function canCacheRequest(req) {
  const method = String(req.method || "GET").toUpperCase();
  const path = String(req.originalUrl || "").split("?")[0];

  if (method !== "GET") {
    return false;
  }

  if (
    path === "/api/inventory/categories" ||
    path === "/api/orders/medicines" ||
    path === "/api/orders/pickup-slots" ||
    path === "/api/analytics/summary" ||
    path.startsWith("/api/inventory/medicines")
  ) {
    return true;
  }

  return false;
}

function getCachePrefixesForPath(path = "") {
  const normalized = String(path || "").trim().toLowerCase();

  if (normalized.startsWith("/api/inventory")) {
    return ["GET|anonymous|/api/inventory", "GET|student|/api/inventory", "GET|pharmacist|/api/inventory", "GET|admin|/api/inventory"];
  }

  if (normalized.startsWith("/api/orders")) {
    return ["GET|anonymous|/api/orders", "GET|student|/api/orders", "GET|pharmacist|/api/orders", "GET|admin|/api/orders"];
  }

  if (normalized.startsWith("/api/analytics")) {
    return ["GET|anonymous|/api/analytics", "GET|student|/api/analytics", "GET|pharmacist|/api/analytics", "GET|admin|/api/analytics"];
  }

  return ["GET|"];
}

async function invalidateCacheForRequest(req) {
  const method = String(req.method || "GET").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return;
  }

  const prefixes = getCachePrefixesForPath(req.originalUrl);
  await Promise.all(prefixes.map((prefix) => cache.delByPrefix(prefix)));
}

function copyForwardHeaders(req) {
  const headers = { ...req.headers };
  const hopByHopHeaders = [
    "host",
    "connection",
    "content-length",
    "expect",
    "keep-alive",
    "transfer-encoding",
    "upgrade",
    "te",
    "trailer",
    "proxy-authenticate",
    "proxy-authorization",
  ];

  hopByHopHeaders.forEach((headerName) => {
    delete headers[headerName];
  });

  headers["x-request-id"] = String(req.headers["x-request-id"] || randomUUID());

  return headers;
}

function shouldRetryStatus(status) {
  return [408, 429, 502, 503, 504].includes(status);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSafeToRetry(req, requestConfig) {
  const method = String(req.method || "GET").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return true;
  }

  const idempotencyKey = String(req.headers["idempotency-key"] || "").trim();
  if (idempotencyKey && method === "POST" && requestConfig.body) {
    return true;
  }

  return false;
}

async function performFetchWithRetry(req, targetUrl, requestConfig) {
  const maxRetries = isSafeToRetry(req, requestConfig) ? FORWARD_RETRY_COUNT : 0;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    try {
      const response = await fetch(targetUrl, {
        ...requestConfig,
        signal: controller.signal,
      });

      if (attempt < maxRetries && shouldRetryStatus(response.status)) {
        try {
          await response.arrayBuffer();
        } catch (_error) {
          // Ignore body read errors while preparing a retry.
        }
        await sleep(100 * 2 ** attempt + Math.floor(Math.random() * 50));
        continue;
      }

      return response;
    } catch (error) {
      if (attempt >= maxRetries) {
        throw error;
      }
      await sleep(100 * 2 ** attempt + Math.floor(Math.random() * 50));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("Gateway retry exhaustion");
}

async function forwardRequest(req, targetBaseUrl) {
  const targetUrl = `${targetBaseUrl}${req.originalUrl}`;
  const headers = copyForwardHeaders(req);

  const requestConfig = {
    method: req.method,
    headers,
  };

  if (!["GET", "HEAD"].includes(req.method.toUpperCase())) {
    const hasBody = req.body && Object.keys(req.body).length > 0;
    if (hasBody) {
      requestConfig.body = JSON.stringify(req.body);
      if (!requestConfig.headers["content-type"]) {
        requestConfig.headers["content-type"] = "application/json";
      }
    }
  }

  const upstreamResponse = await performFetchWithRetry(req, targetUrl, requestConfig);
  const contentType = upstreamResponse.headers.get("content-type");
  const responseBuffer = Buffer.from(await upstreamResponse.arrayBuffer());

  return {
    status: upstreamResponse.status,
    contentType,
    body: responseBuffer,
  };
}

serviceRegistry.forEach((service) => {
  app.use(service.prefix, async (req, res) => {
    try {
      const requestId = String(req.headers["x-request-id"] || randomUUID());
      req.headers["x-request-id"] = requestId;
      res.setHeader("x-request-id", requestId);

      if (canCacheRequest(req)) {
        const cached = await cache.getJSON(buildCacheKey(req));
        if (cached) {
          if (cached.contentType) {
            res.setHeader("content-type", cached.contentType);
          }
          return res.status(cached.status).send(Buffer.from(String(cached.bodyBase64 || ""), "base64"));
        }
      }

      const forwarded = await forwardRequest(req, service.target);

      if (forwarded.contentType) {
        res.setHeader("content-type", forwarded.contentType);
      }

      if (canCacheRequest(req) && forwarded.status >= 200 && forwarded.status < 300) {
        await cache.setJSON(
          buildCacheKey(req),
          {
            status: forwarded.status,
            contentType: forwarded.contentType || "",
            bodyBase64: forwarded.body.toString("base64"),
          },
          CACHE_TTL_SECONDS
        );
      }

      await invalidateCacheForRequest(req);
      return res.status(forwarded.status).send(forwarded.body);
    } catch (error) {
      const detail = error?.cause?.message || error.message;
      console.error(`Gateway proxy error (${service.key}):`, detail);
      return res.status(502).json({ message: `${service.key} service unavailable` });
    }
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    service: "gateway-service",
    status: "ok",
    timestamp: new Date().toISOString(),
    routes: serviceRegistry.map((service) => service.prefix),
  });
});

app.use((req, res) => {
  res.status(404).json({ message: "Route not found in API Gateway" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Gateway running on port ${PORT}`);
});

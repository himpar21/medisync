const axios = require("axios");
const { randomUUID } = require("node:crypto");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(error) {
  const status = Number(error?.response?.status || 0);
  if (!status) {
    return true;
  }
  return status === 408 || status === 429 || status >= 500;
}

function createHttpClient({ baseURL, timeout = 5000, serviceName = "upstream-service" }) {
  const client = axios.create({
    baseURL,
    timeout,
  });

  async function request(config, options = {}) {
    const maxRetries = Math.max(0, Number(options.maxRetries ?? 2));
    const baseDelayMs = Math.max(25, Number(options.baseDelayMs ?? 120));
    const requestId = String(
      config?.headers?.["x-request-id"] || config?.headers?.["X-Request-Id"] || randomUUID()
    ).trim();

    const requestConfig = {
      ...config,
      headers: {
        ...(config.headers || {}),
        "x-request-id": requestId,
      },
    };

    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        return await client.request(requestConfig);
      } catch (error) {
        if (attempt >= maxRetries || !shouldRetry(error)) {
          const upstreamStatus = Number(error?.response?.status || 0);
          const upstreamMessage =
            error?.response?.data?.message ||
            error?.response?.data?.error ||
            error?.message ||
            "request failed";

          const serviceError = new Error(`${serviceName} request failed: ${upstreamMessage}`);
          serviceError.statusCode = upstreamStatus || 502;
          serviceError.meta = {
            requestId,
            upstreamStatus: upstreamStatus || null,
            baseURL,
            path: requestConfig.url || "",
            method: String(requestConfig.method || "GET").toUpperCase(),
          };
          throw serviceError;
        }

        const waitMs = Math.floor(baseDelayMs * 2 ** attempt + Math.random() * 80);
        await sleep(waitMs);
        attempt += 1;
      }
    }

    throw new Error(`${serviceName} request retries exhausted`);
  }

  return {
    request,
  };
}

module.exports = {
  createHttpClient,
};

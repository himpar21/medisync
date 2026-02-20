require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || "http://127.0.0.1:5001";
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || "http://127.0.0.1:5003";

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
  return headers;
}

async function forwardRequest(req, res, targetBaseUrl) {
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

  const upstreamResponse = await fetch(targetUrl, requestConfig);
  const contentType = upstreamResponse.headers.get("content-type");
  const responseBuffer = Buffer.from(await upstreamResponse.arrayBuffer());

  if (contentType) {
    res.setHeader("content-type", contentType);
  }

  res.status(upstreamResponse.status).send(responseBuffer);
}

app.use("/api/auth", async (req, res) => {
  try {
    await forwardRequest(req, res, AUTH_SERVICE_URL);
  } catch (error) {
    const detail = error?.cause?.message || error.message;
    console.error("Gateway auth proxy error:", detail);
    res.status(502).json({ message: "Auth service unavailable" });
  }
});

app.use("/api/orders", async (req, res) => {
  try {
    await forwardRequest(req, res, ORDER_SERVICE_URL);
  } catch (error) {
    const detail = error?.cause?.message || error.message;
    console.error("Gateway order proxy error:", detail);
    res.status(502).json({ message: "Order service unavailable" });
  }
});

app.get("/health", (req, res) => {
  res.status(200).json({
    service: "gateway-service",
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Gateway running on port ${PORT}`);
});

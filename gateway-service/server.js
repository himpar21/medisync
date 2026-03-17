require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { buildServiceRegistry } = require("./src/config/serviceRegistry");
const { gatewayAuth } = require("./src/middlewares/authMiddleware");

const app = express();
const serviceRegistry = buildServiceRegistry();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(gatewayAuth);

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

serviceRegistry.forEach((service) => {
  app.use(service.prefix, async (req, res) => {
    try {
      await forwardRequest(req, res, service.target);
    } catch (error) {
      const detail = error?.cause?.message || error.message;
      console.error(`Gateway proxy error (${service.key}):`, detail);
      res.status(502).json({ message: `${service.key} service unavailable` });
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

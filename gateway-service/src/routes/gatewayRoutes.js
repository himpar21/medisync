const express = require("express");
const proxy = require("express-http-proxy");

const router = express.Router();

router.use(
  "/orders",
  proxy("http://127.0.0.1:5003", {
    proxyReqPathResolver: (req) => `/api/orders${req.url}`,
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      if (srcReq.headers.authorization) {
        proxyReqOpts.headers.authorization = srcReq.headers.authorization;
      }
      if (srcReq.headers["idempotency-key"]) {
        proxyReqOpts.headers["idempotency-key"] = srcReq.headers["idempotency-key"];
      }
      return proxyReqOpts;
    },
  })
);

module.exports = router;

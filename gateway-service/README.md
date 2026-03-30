# Gateway Service

`gateway-service` is the API entrypoint for MediSync.  
It is responsible for authentication enforcement, route-level authorization, forwarding to upstream services, retry behavior, and gateway response caching.

Default port: `5000`

## Responsibilities

1. Acts as a unified API surface for all backend services.
2. Validates JWT tokens on protected routes.
3. Enforces role-based access rules for sensitive paths.
4. Forwards requests to the correct service using service registry mapping.
5. Adds request correlation ID (`x-request-id`) for tracing.
6. Retries selected upstream failures with bounded exponential backoff.
7. Caches selected GET responses (Redis with memory fallback).
8. Invalidates cached API groups on mutating requests.

## Service Registry Mapping

Gateway maps path prefixes to upstream targets:

| Prefix | Upstream Env Var | Default Upstream |
| --- | --- | --- |
| `/api/auth` | `AUTH_SERVICE_URL` | `http://127.0.0.1:5001` |
| `/api/inventory` | `INVENTORY_SERVICE_URL` | `http://127.0.0.1:5002` |
| `/api/orders` | `ORDER_SERVICE_URL` | `http://127.0.0.1:5003` |
| `/api/payments` | `PAYMENT_SERVICE_URL` | `http://127.0.0.1:5004` |
| `/api/analytics` | `ANALYTICS_SERVICE_URL` | `http://127.0.0.1:5005` |

## Public vs Protected Routes

Gateway auth middleware allows unauthenticated access for these routes:

- `GET /health`
- Any `/api/auth/*` route (Auth service owns per-endpoint auth checks)
- `GET /api/orders/medicines`
- `GET /api/orders/pickup-slots`
- `GET /api/inventory/medicines`
- `GET /api/inventory/medicines/:medicineId`
- `GET /api/inventory/categories`
- `POST /api/payments/events` (internal event endpoint)
- `POST /api/analytics/events` (internal event endpoint)

All other routes require a valid `Authorization: Bearer <JWT>` token.

## Route-Level Authorization (Gateway-Enforced)

Gateway rejects requests with insufficient role on:

- Any route under `/api/analytics` except `/api/analytics/events`  
  Allowed roles: `admin`, `pharmacist`
- Any route under `/api/inventory/alerts`  
  Allowed roles: `admin`, `pharmacist`
- `POST|PUT|PATCH|DELETE /api/inventory/medicines*`  
  Allowed roles: `admin`, `pharmacist`
- `PATCH /api/orders/:orderId/status`  
  Allowed roles: `admin`, `pharmacist`

Note: role aliasing maps `patient` to `student`.

## Gateway Endpoints

## `GET /health`

Health and registry metadata.

Example response:

```json
{
  "service": "gateway-service",
  "status": "ok",
  "timestamp": "2026-03-30T10:15:00.000Z",
  "routes": ["/api/auth", "/api/inventory", "/api/orders", "/api/payments", "/api/analytics"]
}
```

## Proxy Behavior For API Routes

All requests under known prefixes are proxied to the target service.

Forwarding characteristics:
- method is preserved
- path and query are preserved
- body is forwarded as JSON for non-GET/HEAD requests with content
- hop-by-hop headers are removed
- `x-request-id` is generated if absent and forwarded downstream
- bearer token is forwarded as regular `authorization` header
- idempotency-key header is preserved

## Retry Behavior

Gateway retries upstream requests when all conditions below are true:

1. Request is safe to retry:
   - `GET`, `HEAD`, `OPTIONS`, or
   - `POST` with `idempotency-key` and body
2. Attempt count has not exceeded `GATEWAY_FORWARD_RETRY_COUNT`
3. Upstream failed due to:
   - network error / timeout, or
   - HTTP status in `[408, 429, 502, 503, 504]`

Backoff:
- exponential with jitter (`~100ms * 2^attempt + jitter`)

## Caching Behavior

Gateway caches selected successful GET responses.

Cache key format:

```text
<METHOD>|<ROLE>|<ORIGINAL_URL>
```

Cacheable routes:
- `GET /api/inventory/categories`
- `GET /api/orders/medicines`
- `GET /api/orders/pickup-slots`
- `GET /api/analytics/summary`
- `GET /api/inventory/medicines*`

Write-through conditions:
- only for 2xx responses
- response status, content type, and body are cached

Invalidation behavior:
- for non-GET/HEAD/OPTIONS requests
- deletes cache entries by API domain prefix:
  - inventory mutations -> invalidate inventory GET cache keys
  - order mutations -> invalidate order GET cache keys
  - analytics mutations -> invalidate analytics GET cache keys

## Error Behavior

- If JWT is missing/invalid on protected routes: `401`
- If role is insufficient: `403`
- If upstream call fails after retries: `502` with `"<service> service unavailable"`
- Unknown route not matching registry: `404` (`Route not found in API Gateway`)

## Environment Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `PORT` | No | `5000` | Gateway port |
| `JWT_SECRET` | Yes | N/A | JWT verify secret |
| `AUTH_SERVICE_URL` | No | `http://127.0.0.1:5001` | Auth upstream |
| `INVENTORY_SERVICE_URL` | No | `http://127.0.0.1:5002` | Inventory upstream |
| `ORDER_SERVICE_URL` | No | `http://127.0.0.1:5003` | Order upstream |
| `PAYMENT_SERVICE_URL` | No | `http://127.0.0.1:5004` | Payment upstream |
| `ANALYTICS_SERVICE_URL` | No | `http://127.0.0.1:5005` | Analytics upstream |
| `REDIS_URL` | No | empty | Redis connection URL |
| `GATEWAY_CACHE_TTL_SECONDS` | No | `15` | Cache TTL for gateway responses |
| `GATEWAY_CACHE_NAMESPACE` | No | `gateway:cache:` | Cache namespace prefix |
| `GATEWAY_UPSTREAM_TIMEOUT_MS` | No | `6000` | Per-attempt upstream timeout |
| `GATEWAY_FORWARD_RETRY_COUNT` | No | `2` | Retry count for retry-safe requests |

Example `.env`:

```env
PORT=5000
JWT_SECRET=your_jwt_secret

AUTH_SERVICE_URL=http://127.0.0.1:5001
INVENTORY_SERVICE_URL=http://127.0.0.1:5002
ORDER_SERVICE_URL=http://127.0.0.1:5003
PAYMENT_SERVICE_URL=http://127.0.0.1:5004
ANALYTICS_SERVICE_URL=http://127.0.0.1:5005

REDIS_URL=redis://127.0.0.1:6379
GATEWAY_CACHE_TTL_SECONDS=15
GATEWAY_CACHE_NAMESPACE=gateway:cache:
GATEWAY_UPSTREAM_TIMEOUT_MS=6000
GATEWAY_FORWARD_RETRY_COUNT=2
```

## Local Run

```bash
cd gateway-service
npm install
npm start
```

Expected log:

```text
Gateway running on port 5000
```

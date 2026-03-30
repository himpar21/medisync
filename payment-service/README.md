# Payment Service

`payment-service` handles payment initialization, synchronization, and order payment-state propagation.

Default port: `5004`  
API base path: `/api/payments`

## Responsibilities

1. Create and track payment records per order/user.
2. Integrate with Stripe PaymentIntents.
3. Expose payment retrieval APIs.
4. Consume order events (`order.created`, `order.status_updated`).
5. Publish payment outcome events (`payment.succeeded`, `payment.failed`).
6. Sync order payment status through order-service internal endpoint.
7. Cache payment reads.

## Data Model Summary

Primary model: `Payment`

Important fields:
- identity: `paymentNumber`, `orderId`, `orderNumber`, `userId`
- amount: `amount`, `currency`
- channel: `method`, `transactionRef`, `stripePaymentIntentId`
- state: `status` (`pending|succeeded|failed|refunded`), `gatewayStatus`, `message`, `paidAt`
- timeline: `history[]`
- metadata blob for gateway/provider details

Important indexes:
- one pending payment per `(orderId, userId)` enforced by partial unique index
- unique non-empty `stripePaymentIntentId`

Concurrency:
- `optimisticConcurrency: true`
- version-conflict saves mapped to `409`

### `EventInbox`

Used for deduplication of incoming internal events by `eventId`.  
TTL index auto-expires old inbox rows.

### `OutboxEvent`

Used for durable async event publication to analytics/order webhook targets.

## Authentication and Authorization

Public/internal event route:
- `POST /events` (validated via optional `x-internal-secret`)

Authenticated routes:
- `GET /config`
- `POST /create`
- `POST /sync`
- `GET /order/:orderId`
- `GET /:paymentId`

Privileged route:
- `GET /` requires `admin` or `pharmacist`

Ownership checks:
- non-privileged users can only read their own payments.

## Endpoint Reference

All routes are under `/api/payments`.

## `POST /events`

Consume internal events (primarily from `order-service`).

Auth:
- if `INTERNAL_SERVICE_SECRET` is configured, request must include matching `x-internal-secret`.

Supported event types:
- `order.created`
- `order.status_updated`

Payload contract:

```json
{
  "eventId": "optional",
  "source": "order-service",
  "eventType": "order.created",
  "payload": {
    "orderId": "65f...",
    "orderNumber": "MS-20260330-1234",
    "userId": "u1",
    "totalAmount": 88.2
  },
  "emittedAt": "2026-03-30T11:00:00.000Z"
}
```

Behavior:
1. derive deterministic event ID if missing
2. insert inbox row; duplicates return `{ duplicate: true }`
3. process event:
   - `order.created`:
     - create pending payment placeholder if not present
   - `order.status_updated`:
     - if order became `cancelled` or `failed`, mark pending payments as failed
4. mark inbox row `processedAt`

Success response (`200`):

```json
{ "ok": true }
```

Possible errors:
- `400` missing `eventType` or invalid payload prerequisites
- `401` invalid internal signature

## `GET /config`

Return Stripe publishable key for frontend.

Auth: Required

Success response (`200`):

```json
{
  "publishableKey": "pk_test_xxx"
}
```

Possible errors:
- `500` key not configured

Cache:
- key: `payments:stripe:config`
- TTL: `120s`

## `POST /create`

Create or reuse a Stripe PaymentIntent for a specific order.

Auth: Required

Request body:

```json
{
  "orderId": "65f...",
  "orderNumber": "MS-20260330-1234",
  "amount": 88.2,
  "currency": "INR"
}
```

Behavior summary:
1. Validate required order context (`orderId` + enough data to derive amount/order number).
2. If already succeeded for this order/user -> return existing payment (`200`).
3. If latest payment is failed -> return `409 payment_failed`.
4. If pending record exists with intent:
   - retrieve intent
   - update payment record from current Stripe state
   - if succeeded -> return existing captured payment
   - if failed/non-reusable -> return `409 payment_failed`
   - otherwise return existing `clientSecret`
5. If no pending intent:
   - create Stripe PaymentIntent
   - upsert local payment
   - return `clientSecret`
6. stale pending attempts for same order/user are cancelled/marked failed.

Success response (new intent, `201`):

```json
{
  "message": "Stripe payment initialized",
  "publishableKey": "pk_test_xxx",
  "clientSecret": "pi_..._secret_...",
  "paymentIntentId": "pi_...",
  "payment": {}
}
```

Success response (reused pending intent, `200`):

```json
{
  "message": "Stripe payment already initialized",
  "publishableKey": "pk_test_xxx",
  "clientSecret": "pi_..._secret_...",
  "paymentIntentId": "pi_...",
  "payment": {}
}
```

Already captured response (`200`):

```json
{
  "message": "Payment already captured for this order",
  "payment": {},
  "publishableKey": "pk_test_xxx"
}
```

Possible errors:
- `400` missing required fields / amount too low / bad amount
- `409` payment already failed (`code: payment_failed`)
- `500` stripe key misconfiguration

## `POST /sync`

Synchronize local payment record with Stripe after frontend confirms payment.

Auth: Required

Request:

```json
{
  "orderId": "65f...",
  "paymentIntentId": "pi_..."
}
```

Behavior:
1. fetch PaymentIntent from Stripe
2. map Stripe status into local status model
3. upsert/update payment record
4. publish outcome event if state transitioned:
   - `succeeded` -> `payment.succeeded`
   - `failed` -> `payment.failed`

Success response (`200`):

```json
{
  "message": "Payment captured successfully",
  "payment": {}
}
```

Possible errors:
- `400` missing fields
- Stripe/API errors propagated as server failures

## `GET /order/:orderId`

List payment attempts for an order (visibility-filtered).

Auth: Required

Response behavior:
- returns own payments for normal users
- admins/pharmacists can see all for that order
- ensures only one `pending` attempt is surfaced in list output

Success response (`200`):

```json
{
  "items": []
}
```

Cache:
- key prefix: `payments:order:`
- TTL: `30s`

## `GET /:paymentId`

Get one payment by database ID.

Auth: Required

Rules:
- validates ObjectId format
- enforces owner-or-privileged access

Success response (`200`):

```json
{
  "payment": {}
}
```

Possible errors:
- `400` invalid id
- `403` forbidden
- `404` not found

Cache:
- key prefix: `payments:id:`
- TTL: `45s`

## `GET /`

List payments (admin/pharmacist only).

Auth: Required  
Role: `admin` or `pharmacist`

Query params:
- `status` (optional)

Success response (`200`):

```json
{
  "items": []
}
```

Cache:
- key prefix: `payments:list:`
- TTL: `20s`

## Stripe Status Mapping

Payment service maps Stripe intent state to local payment state:

| Stripe status | Local status |
| --- | --- |
| `succeeded` | `succeeded` |
| `canceled` | `failed` |
| `requires_payment_method` with last error | `failed` |
| pending-like statuses (`processing`, `requires_action`, etc.) | `pending` |

## Outbox Event Publishing

Outbox worker (`src/events/publisher.js`) sends events to:
- analytics service event ingest
- order service internal payment-status sync endpoint
- optional external notification webhook

Published events:
- `payment.succeeded`
- `payment.failed`

For `payment.succeeded`, order sync payload:

```json
{
  "paymentStatus": "paid",
  "status": "confirmed"
}
```

For `payment.failed`, order sync payload:

```json
{
  "paymentStatus": "failed",
  "status": "payment_pending"
}
```

## Caching

Cache module: `src/services/paymentCache.js`

- Redis-first cache
- local in-memory fallback
- namespace default: `payment:cache:`

Invalidation:
- on payment updates/sync
- on event handling side effects

## Health Endpoint

`GET /health`:

```json
{
  "service": "payment-service",
  "status": "ok",
  "timestamp": "2026-03-30T11:10:00.000Z"
}
```

## Environment Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `PORT` | No | `5004` | Service port |
| `MONGO_URI` | Yes | N/A | MongoDB connection string |
| `JWT_SECRET` | Yes | N/A | JWT verification secret |
| `CLIENT_URL` | No | `*` | CORS allowed origin |
| `STRIPE_SECRET_KEY` | Yes | N/A | Stripe secret key |
| `STRIPE_PUBLISHABLE_KEY` | Yes | N/A | Stripe publishable key |
| `STRIPE_MIN_AMOUNT_INR` | No | `50` | Minimum INR payment amount |
| `REDIS_URL` | No | empty | Redis URL |
| `PAYMENT_CACHE_TTL_SECONDS` | No | `30` | Cache default TTL |
| `PAYMENT_CACHE_NAMESPACE` | No | `payment:cache:` | Cache namespace |
| `ANALYTICS_EVENT_URL` | No | empty | Analytics event ingest URL |
| `ORDER_SERVICE_INTERNAL_URL` | No | `http://127.0.0.1:5003/api/orders/internal` | Order internal sync base |
| `NOTIFICATION_WEBHOOK_URL` | No | empty | Optional external notification webhook |
| `INTERNAL_SERVICE_SECRET` | No | empty | Internal signature header |
| `PAYMENT_OUTBOX_POLL_MS` | No | `1500` | Outbox poll interval |
| `PAYMENT_OUTBOX_BATCH_SIZE` | No | `20` | Outbox batch size |
| `PAYMENT_OUTBOX_MAX_ATTEMPTS` | No | `8` | Outbox retry limit |
| `PAYMENT_OUTBOX_BASE_BACKOFF_MS` | No | `1200` | Outbox base backoff |
| `PAYMENT_EVENT_TIMEOUT_MS` | No | `5000` | Outbox dispatch timeout |
| `EVENT_INBOX_TTL_SECONDS` | No | `604800` | Inbox TTL in seconds |

Example `.env`:

```env
PORT=5004
MONGO_URI=mongodb://127.0.0.1:27017/medisync_payment
JWT_SECRET=your_jwt_secret
CLIENT_URL=http://localhost:3000

STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_MIN_AMOUNT_INR=50

REDIS_URL=redis://127.0.0.1:6379
PAYMENT_CACHE_TTL_SECONDS=30
PAYMENT_CACHE_NAMESPACE=payment:cache:

ANALYTICS_EVENT_URL=http://127.0.0.1:5005/api/analytics/events
ORDER_SERVICE_INTERNAL_URL=http://127.0.0.1:5003/api/orders/internal
NOTIFICATION_WEBHOOK_URL=
INTERNAL_SERVICE_SECRET=your_internal_secret

PAYMENT_OUTBOX_POLL_MS=1500
PAYMENT_OUTBOX_BATCH_SIZE=20
PAYMENT_OUTBOX_MAX_ATTEMPTS=8
PAYMENT_OUTBOX_BASE_BACKOFF_MS=1200
PAYMENT_EVENT_TIMEOUT_MS=5000
EVENT_INBOX_TTL_SECONDS=604800
```

## Local Run

```bash
cd payment-service
npm install
npm start
```

Expected logs:

```text
Payment Service connected to MongoDB
Payment Service running on port 5004
```

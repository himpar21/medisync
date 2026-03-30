# Analytics Service

`analytics-service` ingests platform events and provides aggregated reporting endpoints for privileged users.

Default port: `5005`  
API base path: `/api/analytics`

## Responsibilities

1. Ingest domain events from other services.
2. Deduplicate events by event ID (inbox pattern).
3. Persist event-derived report snapshots.
4. Expose aggregated dashboards:
   - totals summary
   - daily sales
   - top medicines
   - user activity
5. Cache aggregate responses and invalidate cache when new events are processed.

## Data Model Summary

### `Report`

Report rows are keyed effectively by `orderId` and updated over time as order/payment events arrive.

Contains:
- order metadata (`orderId`, `orderNumber`, `userId`)
- order financials (`totalAmount`, `paymentStatus`, status)
- line item snapshots
- timestamps (`placedAt`, `paidAt`, `lastEventAt`)
- `rawEvents[]` audit trail for consumed events

### `EventInbox`

Tracks processed event IDs to avoid duplicate processing.

Fields:
- `eventId` (unique)
- `source`
- `eventType`
- `receivedAt`
- `processedAt`

TTL index auto-removes old entries.

## Authentication and Authorization

Public/internal endpoint:
- `POST /events` (internal signature check if configured)

Protected reporting endpoints:
- all `GET` reporting routes require authentication and role in `admin` or `pharmacist`.

## Endpoint Reference

All routes are under `/api/analytics`.

## `POST /events`

Ingest one domain event.

Auth:
- if `INTERNAL_SERVICE_SECRET` is configured, request must include matching `x-internal-secret`

Request body:

```json
{
  "eventId": "optional",
  "source": "order-service",
  "eventType": "order.created",
  "payload": {},
  "emittedAt": "2026-03-30T11:15:00.000Z"
}
```

If `eventId` is absent, analytics derives deterministic ID from event fields.

Supported typed handlers:
- `order.created`
- `order.status_updated`
- `payment.succeeded`
- `payment.failed`

Unknown event behavior:
- if payload contains `orderId`, event is still appended to `rawEvents`

Processing flow:
1. Validate event type.
2. Deduplicate through inbox insert.
3. Run event handler in aggregation service.
4. Invalidate summary cache key.
5. Mark inbox record processed.

Duplicate event response (`200`):

```json
{
  "ok": true,
  "duplicate": true
}
```

Success response (`200`):

```json
{
  "ok": true
}
```

Possible errors:
- `400` missing eventType
- `401` invalid internal signature

## `GET /summary`

Return aggregated dashboard payload.

Auth: `admin` or `pharmacist`

Success response (`200`):

```json
{
  "totals": {
    "orders": 120,
    "medicines": 42,
    "users": 55,
    "pendingPayments": 8,
    "revenue": 48320.5
  },
  "dailySales": [],
  "topMedicines": [],
  "userActivity": []
}
```

Cache:
- key: `summary`
- TTL controlled by `ANALYTICS_SUMMARY_CACHE_TTL_SECONDS` (default `30s`)

## `GET /sales/daily`

Return only daily sales series.

Auth: `admin` or `pharmacist`

Response:

```json
{
  "items": [
    {
      "date": "2026-03-30",
      "orders": 5,
      "revenue": 2200.5
    }
  ]
}
```

## `GET /medicines/top`

Return top-selling medicines by quantity.

Auth: `admin` or `pharmacist`

Response:

```json
{
  "items": [
    {
      "medicineId": "65f...",
      "medicineName": "Paracetamol 650",
      "totalQuantity": 120,
      "totalRevenue": 5040
    }
  ]
}
```

## `GET /users/activity`

Return user-level activity ranking.

Auth: `admin` or `pharmacist`

Response:

```json
{
  "items": [
    {
      "userId": "u1",
      "totalOrders": 12,
      "totalSpend": 5420.2,
      "lastOrderAt": "2026-03-29T16:20:00.000Z"
    }
  ]
}
```

## Aggregation Logic Details

`src/services/aggregationService.js` computes summary through Mongo aggregations:

- `totals.orders`: `Report.countDocuments()`
- `totals.revenue`: sum `totalAmount` where `paymentStatus = paid`
- `totals.pendingPayments`: count where `paymentStatus = pending`
- `totals.users`: distinct `userId` count
- `totals.medicines`:
  - preferred: live count from inventory service `/api/inventory/medicines`
  - fallback: distinct medicine IDs in `Report.items`
- `dailySales`: grouped by paid date (paidAt fallback placedAt), limited to last 14 days
- `topMedicines`: unwind `items`, group by medicine, sort by quantity, top 5
- `userActivity`: group by user with orders/spend/last order, top 10

## Event Mapping Into Reports

### `order.created`

Creates/upserts report row with:
- order identity
- user
- amount
- status
- `paymentStatus = pending`
- item snapshots

### `order.status_updated`

Updates:
- status
- optional paymentStatus from event payload
- `lastEventAt`

### `payment.succeeded`

Updates:
- `paymentStatus = paid`
- `status = confirmed`
- `paidAt`
- optional amount overwrite from event payload

### `payment.failed`

Updates:
- `paymentStatus = failed`
- `lastEventAt`

## Caching

Cache module: `src/services/summaryCache.js`

- Redis-first, memory fallback
- namespace default: `analytics:cache:`
- summary key cleared every time an event is successfully ingested

## Health Endpoint

`GET /health`:

```json
{
  "service": "analytics-service",
  "status": "ok",
  "timestamp": "2026-03-30T11:20:00.000Z"
}
```

## Environment Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `PORT` | No | `5005` | Service port |
| `MONGO_URI` | Yes | N/A | MongoDB connection string |
| `JWT_SECRET` | Yes | N/A | JWT verification secret |
| `CLIENT_URL` | No | `*` | CORS allowed origin |
| `INTERNAL_SERVICE_SECRET` | No | empty | Internal signature secret |
| `REDIS_URL` | No | empty | Redis URL |
| `ANALYTICS_SUMMARY_CACHE_TTL_SECONDS` | No | `30` | Summary cache TTL |
| `ANALYTICS_CACHE_NAMESPACE` | No | `analytics:cache:` | Cache namespace |
| `INVENTORY_SERVICE_URL` | No | `http://127.0.0.1:5002` | Inventory URL for medicine count fallback |
| `INVENTORY_TIMEOUT_MS` | No | `5000` | Inventory request timeout |
| `EVENT_INBOX_TTL_SECONDS` | No | `604800` | Inbox dedup record TTL |

Example `.env`:

```env
PORT=5005
MONGO_URI=mongodb://127.0.0.1:27017/medisync_analytics
JWT_SECRET=your_jwt_secret
CLIENT_URL=http://localhost:3000

REDIS_URL=redis://127.0.0.1:6379
ANALYTICS_SUMMARY_CACHE_TTL_SECONDS=30
ANALYTICS_CACHE_NAMESPACE=analytics:cache:

INVENTORY_SERVICE_URL=http://127.0.0.1:5002
INVENTORY_TIMEOUT_MS=5000
INTERNAL_SERVICE_SECRET=your_internal_secret
EVENT_INBOX_TTL_SECONDS=604800
```

## Local Run

```bash
cd analytics-service
npm install
npm start
```

Expected logs:

```text
Analytics Service connected to MongoDB
Analytics Service running on port 5005
```

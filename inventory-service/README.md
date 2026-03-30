# Inventory Service

`inventory-service` is the source of truth for medicine catalog and stock state.

Default port: `5002`  
API base path: `/api/inventory`

## Responsibilities

1. Catalog management (medicine CRUD with medical metadata)
2. Batch-aware stock bookkeeping
3. Stock workflows for checkout:
   - verify stock
   - reserve stock
   - release reserved stock
   - deduct stock
4. Alert APIs:
   - low stock
   - upcoming expiry
5. Event publication for catalog changes (`medicine_created/updated/deleted`)
6. Redis-backed read caching + invalidation on writes

## Data Model Summary

Primary model: `Medicine`

Key fields:
- identity and catalog: `code`, `name`, `category`, `description`, `manufacturer`
- medical details: `prescriptionRequired`, `uses`, `dosage`, `sideEffects`, `warnings`, `storageInstructions`
- pricing/media: `price`, `imageData`
- inventory:
  - aggregate: `stock`, `reservedStock`
  - batches: `batches[]` each with `batchNo`, `expiryDate`, `stock`, `reservedStock`, `reservations[]`

Computed inventory terms:
- `availableStock = stock - reservedStock`
- batch-level availability behaves the same way

Concurrency:
- `optimisticConcurrency: true` on model
- stock mutation service retries version conflicts and can rollback snapshots

## Authentication and Authorization

Public read routes:
- `GET /medicines`
- `GET /medicines/:medicineId`
- `GET /categories`

Optional auth route:
- `GET /medicines` and `GET /medicines/:medicineId` accept auth optionally to expose privileged visibility (for example inactive records in list when `includeInactive=true` and caller is privileged).

Protected routes:
- alerts and all medicine mutations require `admin` or `pharmacist`.

Stock workflow routes are not token-guarded inside service code (expected to be protected by network/gateway/internal trust patterns).

## Endpoint Reference

All routes are under `/api/inventory`.

## `GET /medicines`

List medicines with filtering and role-sensitive visibility.

Auth: Optional

Query params:
- `q` (optional): text search across medicine `name` and `code`
- `category` (optional): exact category filter
- `includeInactive=true` (optional): honored only for privileged users

Success response (`200`):

```json
{
  "items": [
    {
      "id": "65f...",
      "_id": "65f...",
      "code": "PARA650",
      "name": "Paracetamol 650",
      "description": "Fever and pain relief",
      "prescriptionRequired": false,
      "uses": "",
      "dosage": "",
      "sideEffects": "",
      "warnings": "",
      "storageInstructions": "",
      "category": "Pain Relief",
      "manufacturer": "Acme Pharma",
      "imageData": "",
      "price": 42,
      "stock": 120,
      "reservedStock": 10,
      "availableStock": 110,
      "lowStockThreshold": 10,
      "expiryDate": "2026-12-31T00:00:00.000Z",
      "batchNo": "B-001",
      "batches": [],
      "batchCount": 2,
      "isActive": true,
      "createdAt": "2026-03-30T10:00:00.000Z",
      "updatedAt": "2026-03-30T10:00:00.000Z"
    }
  ]
}
```

Cache:
- key prefix: `inventory:medicine:list:`
- TTL: `45s`

## `GET /medicines/:medicineId`

Get one medicine by ID.

Auth: Optional

Success response (`200`):

```json
{
  "medicine": {
    "id": "65f...",
    "name": "Paracetamol 650"
  }
}
```

Possible errors:
- `400` missing `medicineId`
- `404` not found or inactive for non-privileged caller

Cache:
- key prefix: `inventory:medicine:item:`
- TTL: `120s`

## `GET /categories`

Get distinct active categories.

Auth: Public

Success response (`200`):

```json
{
  "items": ["Antibiotics", "Pain Relief", "Supplements"]
}
```

Cache:
- key: `inventory:medicine:categories`
- TTL: `300s`

## `POST /stock/verify`

Check stock availability without reserving.

Auth: Internal/workflow

Request:

```json
{
  "items": [
    { "medicineId": "65f1", "quantity": 2 },
    { "medicineId": "65f2", "quantity": 1 }
  ]
}
```

Success response (`200`):

```json
{
  "ok": true,
  "unavailable": []
}
```

Unavailable case:

```json
{
  "ok": false,
  "unavailable": [
    {
      "medicineId": "65f2",
      "requested": 5,
      "available": 2,
      "reason": "insufficient_stock"
    }
  ]
}
```

## `POST /stock/reserve`

Reserve stock for a reference (typically order number).

Auth: Internal/workflow

Request:

```json
{
  "reference": "MS-20260330-1234",
  "items": [
    { "medicineId": "65f1", "quantity": 2 }
  ]
}
```

Success response (`200`):

```json
{
  "ok": true,
  "message": "Stock reserved successfully"
}
```

Possible errors:
- `409` insufficient stock / reservation failure

Behavior:
- reserves across batches based on available quantity
- reservation entries are stored in batch-level `reservations[]`
- inventory caches are invalidated on success

## `POST /stock/release`

Release previously reserved stock.

Auth: Internal/workflow

Request:

```json
{
  "reference": "MS-20260330-1234",
  "items": [
    { "medicineId": "65f1", "quantity": 2 }
  ]
}
```

Success response (`200`):

```json
{
  "ok": true,
  "message": "Reserved stock released"
}
```

Behavior:
- tries to release matching reservation reference first
- if needed, can release from generic reservation entries
- invalidates inventory caches

## `POST /stock/deduct`

Deduct final stock after fulfillment/commit step.

Auth: Internal/workflow

Request:

```json
{
  "reference": "MS-20260330-1234",
  "items": [
    { "medicineId": "65f1", "quantity": 2 }
  ]
}
```

Success response (`200`):

```json
{
  "ok": true,
  "message": "Stock deducted successfully"
}
```

Possible errors:
- `409` insufficient stock

Behavior:
- consumes reserved quantity for matching reference first
- then consumes free available stock if needed
- snapshot rollback is used on failure
- invalidates inventory caches on success

## `GET /alerts/low-stock`

List active medicines with low available stock.

Auth: `admin` or `pharmacist`

Query params:
- `threshold` (optional positive integer). If omitted, each medicine’s `lowStockThreshold` is used.

Success response (`200`):

```json
{
  "items": [],
  "total": 0
}
```

Cache:
- key prefix: `inventory:alert:low:`
- TTL: `30s`

## `GET /alerts/expiry`

List batches expiring within a time window.

Auth: `admin` or `pharmacist`

Query params:
- `days` (optional positive integer, default `30`)

Success response (`200`):

```json
{
  "items": [
    {
      "id": "65f...",
      "name": "CalciD3 Forte",
      "batchNo": "C-203",
      "expiryDate": "2026-04-15T00:00:00.000Z",
      "batchAvailableStock": 20,
      "batchStock": 25,
      "daysToExpiry": 16
    }
  ],
  "total": 1
}
```

Cache:
- key prefix: `inventory:alert:expiry:`
- TTL: `45s`

## `POST /medicines`

Create medicine or append a new batch if same code/name already exists.

Auth: `admin` or `pharmacist`

Required body fields:
- `code`, `name`, `category`, `price`, `stock`, `expiryDate`

Optional fields:
- all metadata fields, `batchNo`, `lowStockThreshold`, `imageData`

`imageData` rules:
- must be `data:image/...`
- max payload size ~6MB

Behavior:
- if code exists with different name -> `409`
- if code exists with same name -> merges/appends batch and returns `201`
- if new -> creates medicine with initial batch and returns `201`

Side effects:
- cache invalidation across list/item/category/alert keys
- emits `inventory.medicine_created` or `inventory.medicine_updated`

## `PUT /medicines/:medicineId`

Update medicine metadata and selected inventory fields.

Auth: `admin` or `pharmacist`

Supports:
- pricing, metadata, status, image, stock, threshold, code, batch metadata constraints

Important validations:
- `price >= 0`
- `stock >= 0`
- stock cannot be lower than currently reserved stock
- code must remain unique
- batch expiry/batchNo editing blocked when medicine has multiple batches

Success response (`200`):

```json
{
  "message": "Medicine updated successfully",
  "medicine": {}
}
```

Side effects:
- full inventory cache invalidation
- emits `inventory.medicine_updated`

## `PATCH /medicines/:medicineId/stock`

Specialized stock adjustment endpoint.

Auth: `admin` or `pharmacist`

Request body:

```json
{
  "mode": "set",
  "quantity": 100
}
```

`mode` values:
- `set` -> set total stock to quantity (cannot go below reserved stock)
- `add` -> increase stock by quantity
- `subtract` -> decrease stock from available quantity only

Possible errors:
- `400` invalid mode/args
- `404` medicine not found
- `409` subtract would violate reserved stock

Side effects:
- cache invalidation
- emits `inventory.medicine_updated`

## `DELETE /medicines/:medicineId`

Delete medicine by ID.

Auth: `admin` or `pharmacist`

Success response (`200`):

```json
{
  "message": "Medicine deleted successfully"
}
```

Possible errors:
- `400` missing id
- `404` not found

Side effects:
- cache invalidation
- emits `inventory.medicine_deleted`

## Caching Details

Cache module: `src/config/redis.js`

- Redis-first, memory fallback
- operations:
  - `getJSON`
  - `setJSON`
  - `delKey`
  - `delByPrefix`

Important cache key families:
- medicine list: `inventory:medicine:list:*`
- medicine item: `inventory:medicine:item:*`
- categories: `inventory:medicine:categories`
- alerts: `inventory:alert:*`

## Event Publishing (Outbox Pattern)

Outbox model: `src/models/OutboxEvent.js`  
Worker: `src/services/eventPublisher.js`

Event pipeline:
1. write event row to outbox collection
2. worker polls pending rows
3. claim row (`status=processing`, increment attempts)
4. POST event to analytics endpoint
5. mark `sent` on success, or `pending/failed` with backoff on failure

Published event types:
- `inventory.medicine_created`
- `inventory.medicine_updated`
- `inventory.medicine_deleted`

## Error Handling

Global error middleware returns:

```json
{
  "message": "Internal server error"
}
```

with `500` unless a custom `statusCode` is set.

## Health Endpoint

`GET /health`:

```json
{
  "service": "inventory-service",
  "status": "ok",
  "timestamp": "2026-03-30T10:30:00.000Z"
}
```

## Environment Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `PORT` | No | `5002` | Service port |
| `MONGO_URI` | Yes | N/A | MongoDB connection string |
| `JWT_SECRET` | Yes | N/A | JWT verification for protected routes |
| `CLIENT_URL` | No | `*` | CORS allowed origin |
| `REDIS_URL` | No | empty | Redis URL |
| `CACHE_TTL_SECONDS` | No | `60` | Default cache TTL |
| `ANALYTICS_EVENT_URL` | No | empty | Analytics event ingest URL |
| `INTERNAL_SERVICE_SECRET` | No | empty | Internal signature header value |
| `INVENTORY_OUTBOX_POLL_MS` | No | `1500` | Outbox poll interval |
| `INVENTORY_OUTBOX_BATCH_SIZE` | No | `20` | Outbox batch size |
| `INVENTORY_OUTBOX_MAX_ATTEMPTS` | No | `8` | Outbox max retries |
| `INVENTORY_OUTBOX_BASE_BACKOFF_MS` | No | `1200` | Outbox retry base backoff |
| `INVENTORY_EVENT_TIMEOUT_MS` | No | `5000` | Event publish timeout |

Example `.env`:

```env
PORT=5002
MONGO_URI=mongodb://127.0.0.1:27017/medisync_inventory
JWT_SECRET=your_jwt_secret
CLIENT_URL=http://localhost:3000

REDIS_URL=redis://127.0.0.1:6379
CACHE_TTL_SECONDS=60

ANALYTICS_EVENT_URL=http://127.0.0.1:5005/api/analytics/events
INTERNAL_SERVICE_SECRET=your_internal_secret
INVENTORY_OUTBOX_POLL_MS=1500
INVENTORY_OUTBOX_BATCH_SIZE=20
INVENTORY_OUTBOX_MAX_ATTEMPTS=8
INVENTORY_OUTBOX_BASE_BACKOFF_MS=1200
INVENTORY_EVENT_TIMEOUT_MS=5000
```

## Local Run

```bash
cd inventory-service
npm install
npm start
```

Expected logs:

```text
Inventory Service connected to MongoDB
Inventory Service running on port 5002
```

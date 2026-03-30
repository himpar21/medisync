# Order Service

`order-service` handles:
- medicine browsing proxy (from inventory)
- cart management
- pickup slot generation
- checkout and order creation
- order history and status transitions
- internal payment-status synchronization

Default port: `5003`  
API base path: `/api/orders`

## Responsibilities

1. Own cart state per user.
2. Convert cart into immutable order records.
3. Reserve/release stock through inventory APIs.
4. Maintain order status history and order-level payment status.
5. Publish order domain events via outbox (`order.created`, `order.status_updated`).

## Core Data Models

### `Cart`

- unique per `userId`
- line items include medicine snapshot fields: id/name/category/image/unit price/quantity/line total
- computed totals: `totalItems`, `subtotal`
- checkout lock fields:
  - `isLocked`
  - `lockExpiresAt`

Concurrency: `optimisticConcurrency: true`

### `Order`

- immutable order snapshot of cart items and amounts
- fields: `orderNumber`, `userId`, `items[]`, totals, pickup slot, address, note
- status fields:
  - `status` (`placed|payment_pending|confirmed|ready_for_pickup|picked_up|cancelled`)
  - `paymentStatus` (`pending|paid|failed|refunded`)
  - `inventoryStatus` (`reserved|released|deducted|failed`)
- idempotency field: `idempotencyKey` (unique per user when present)
- `statusHistory[]` for audit trail

Concurrency: `optimisticConcurrency: true`

## Authentication and Authorization

Public routes:
- `GET /medicines`
- `GET /pickup-slots`

Internal route:
- `PATCH /internal/:orderId/payment-status` uses internal signature middleware (`x-internal-secret`)

Authenticated user routes:
- cart CRUD
- checkout
- own order history/details

Privileged route:
- `PATCH /:orderId/status` requires `admin` or `pharmacist`

## Endpoint Reference

All routes are mounted under `/api/orders`.

## `GET /medicines`

Fetch medicine list through inventory client, normalized for order UI.

Auth: Public

Query params:
- `q` (optional)
- `category` (optional)

Success response (`200`):

```json
{
  "items": [
    {
      "id": "65f...",
      "name": "Paracetamol 650",
      "description": "Fever and pain relief",
      "prescriptionRequired": false,
      "uses": "",
      "dosage": "",
      "sideEffects": "",
      "warnings": "",
      "storageInstructions": "",
      "category": "Pain Relief",
      "price": 42,
      "stock": 110,
      "availableStock": 110,
      "manufacturer": "Acme Pharma",
      "imageData": "",
      "expiryDate": "2026-12-31T00:00:00.000Z",
      "batchNo": "B-001"
    }
  ]
}
```

## `GET /pickup-slots`

Generate upcoming pickup windows.

Auth: Public

Behavior:
- generates 4 days of slots
- default windows per day:
  - `09:00 - 11:00`
  - `11:00 - 13:00`
  - `14:00 - 16:00`
  - `16:00 - 18:00`
  - `18:00 - 20:00`

Success response (`200`):

```json
{
  "items": [
    {
      "id": "2026-03-30-S1",
      "date": "2026-03-30T00:00:00.000Z",
      "label": "09:00 - 11:00"
    }
  ]
}
```

## `GET /cart`

Return authenticated user cart.

Auth: Required

Success response (`200`):

```json
{
  "cart": {
    "userId": "u1",
    "items": [],
    "totalItems": 0,
    "subtotal": 0,
    "currency": "INR",
    "updatedAt": "2026-03-30T10:40:00.000Z"
  }
}
```

Behavior:
- creates cart automatically if missing
- recalculates totals before response
- hydrates missing images from inventory and persists if found

## `POST /cart/items`

Add medicine to cart.

Auth: Required

Request:

```json
{
  "medicineId": "65f...",
  "quantity": 2
}
```

Rules:
- `medicineId` required
- quantity min `1`
- quantity per item max `20`
- requested quantity must not exceed current `availableStock`

Success response (`200`): returns full updated cart.

Possible errors:
- `400` invalid input / quantity > 20
- `404` medicine not found
- `409` quantity exceeds stock

Concurrency:
- cart mutation uses retry-on-version-conflict

## `PATCH /cart/items/:medicineId`

Update quantity for one cart item.

Auth: Required

Request:

```json
{
  "quantity": 3
}
```

Rules:
- `quantity <= 0` removes the item
- max quantity `20`

Possible errors:
- `404` cart item not found
- `400` invalid input

Success response (`200`): full updated cart.

## `DELETE /cart/items/:medicineId`

Remove one item from cart.

Auth: Required

Success response (`200`): full updated cart.

## `DELETE /cart`

Clear all cart items.

Auth: Required

Success response (`200`): empty cart payload.

## `POST /checkout`

Create order from current cart with stock reservation and idempotency protection.

Auth: Required

Headers:
- optional `idempotency-key` (recommended)

Request:

```json
{
  "pickupSlot": {
    "date": "2026-04-01T00:00:00.000Z",
    "label": "11:00 - 13:00"
  },
  "address": "Block A, Room 204",
  "note": "Call on arrival",
  "idempotencyKey": "optional-fallback-if-header-not-set"
}
```

Validation:
- `address` required
- `pickupSlot.date` and `pickupSlot.label` required

Flow:
1. If idempotency key exists, check if order already created for `(userId, key)`.
2. Acquire cart lock (`isLocked=true`, lock expiry 2 minutes).
3. Verify stock with inventory.
4. Reserve stock with reference = generated `orderNumber`.
5. Compute totals:
   - `tax = 5% of subtotal`
   - `deliveryFee = 0`
6. Create order with `status=payment_pending`, `paymentStatus=pending`, `inventoryStatus=reserved`.
7. Clear cart and release lock.
8. Publish `order.created`.
9. Return created order.

Success response (`201`):

```json
{
  "message": "Order placed successfully",
  "order": {
    "id": "65f...",
    "orderNumber": "MS-20260330-1234",
    "status": "payment_pending",
    "paymentStatus": "pending"
  }
}
```

Idempotent replay response (`200`):

```json
{
  "message": "Order already created for this idempotency key",
  "order": {}
}
```

Possible errors:
- `400` missing address/slot/cart empty
- `409` checkout in progress, stock unavailable, reserve failure
- propagated server errors

Failure safety:
- if reservation happened and downstream failure occurs, service attempts stock release rollback
- cart lock is released in `finally` block

## `GET /`

Get order history.

Auth: Required

Scope:
- `admin/pharmacist`: all recent orders (limit 100)
- regular user: own orders only

Success response (`200`):

```json
{
  "items": [
    {
      "id": "65f...",
      "orderNumber": "MS-20260330-1234",
      "userId": "u1",
      "items": [],
      "totalItems": 2,
      "subtotal": 84,
      "tax": 4.2,
      "deliveryFee": 0,
      "totalAmount": 88.2,
      "currency": "INR",
      "pickupSlot": { "date": "2026-04-01T00:00:00.000Z", "label": "11:00 - 13:00" },
      "address": "Block A, Room 204",
      "status": "payment_pending",
      "paymentStatus": "pending",
      "inventoryStatus": "reserved",
      "statusHistory": [],
      "note": "",
      "placedAt": "2026-03-30T10:50:00.000Z",
      "updatedAt": "2026-03-30T10:50:00.000Z"
    }
  ]
}
```

Behavior:
- hydrates missing item images from inventory and persists if resolved

## `GET /:orderId`

Get one order.

Auth: Required

Scope:
- `admin/pharmacist`: any order
- regular user: own order only

Possible errors:
- `404` not found or not visible

Success response (`200`):

```json
{
  "order": {}
}
```

## `PATCH /:orderId/status`

Update order status manually (admin/pharmacist).

Auth: Required  
Role: `admin` or `pharmacist`

Request:

```json
{
  "status": "ready_for_pickup",
  "note": "Packed and ready"
}
```

Allowed statuses:
- `placed`
- `payment_pending`
- `confirmed`
- `ready_for_pickup`
- `picked_up`
- `cancelled`

Behavior:
- if status changes to `cancelled` while inventory is reserved:
  - releases stock via inventory service
  - sets `inventoryStatus = released`
- appends status history entry
- publishes `order.status_updated`

Possible errors:
- `400` invalid status
- `404` order not found
- `409` optimistic concurrency conflict

## `PATCH /internal/:orderId/payment-status`

Internal callback endpoint for payment service.

Auth: Internal signature via `x-internal-secret` (if configured)

Request:

```json
{
  "paymentStatus": "paid",
  "status": "confirmed"
}
```

`paymentStatus` allowed:
- `pending`
- `paid`
- `failed`
- `refunded`

Status logic:
- if explicit valid `status` provided -> use it
- else:
  - `paid` and order in `placed/payment_pending` -> `confirmed`
  - `failed` and order in `placed/payment_pending` -> `payment_pending`

Side effects:
- appends history entry (`updatedBy=payment-service`)
- publishes `order.status_updated` only when status actually changed

Possible errors:
- `400` invalid status/paymentStatus
- `401` invalid internal signature (when secret configured)
- `404` order not found
- `409` optimistic concurrency conflict

## Inter-Service Communication

### Inventory client (`src/services/inventoryClient.js`)

Used for:
- list medicines
- get medicine by id
- verify stock
- reserve stock
- release stock

Behavior:
- HTTP retries with timeout
- local cache for list/item reads (`order-service` cache module)
- cache invalidation after reserve/release

### Event publishing (`src/services/eventPublisher.js`)

Outbox model persists events before network publish.

Targets:
- payment service event endpoint
- analytics event endpoint

Events:
- `order.created`
- `order.status_updated`

Outbox worker:
- polls pending events
- claims events atomically
- retries with exponential backoff
- marks final state (`sent` or `failed`)

## Caching

Cache module: `src/services/cache.js`

- Redis-first, memory fallback
- default namespace: `order:cache:`
- used by order inventory client for medicine list/item caching

## Health Endpoint

`GET /health`:

```json
{
  "service": "order-service",
  "status": "ok",
  "timestamp": "2026-03-30T10:55:00.000Z"
}
```

## Environment Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `PORT` | No | `5003` | Service port |
| `MONGO_URI` | Yes | N/A | MongoDB connection string |
| `JWT_SECRET` | Yes | N/A | JWT verification secret |
| `CLIENT_URL` | No | `*` | CORS allowed origin |
| `INVENTORY_SERVICE_URL` | No | `http://127.0.0.1:5002` | Inventory base URL |
| `INVENTORY_TIMEOUT_MS` | No | `5000` | Inventory call timeout |
| `INVENTORY_CACHE_TTL_SECONDS` | No | `15` | Inventory read cache TTL (inside order service) |
| `REDIS_URL` | No | empty | Redis URL |
| `ORDER_CACHE_TTL_SECONDS` | No | `30` | Default cache TTL |
| `ORDER_CACHE_NAMESPACE` | No | `order:cache:` | Cache namespace |
| `PAYMENT_EVENT_URL` | No | empty | Payment event ingest URL |
| `ANALYTICS_EVENT_URL` | No | empty | Analytics event ingest URL |
| `INTERNAL_SERVICE_SECRET` | No | empty | Internal endpoint signature |
| `ORDER_OUTBOX_POLL_MS` | No | `1500` | Outbox poll interval |
| `ORDER_OUTBOX_BATCH_SIZE` | No | `20` | Outbox batch size |
| `ORDER_OUTBOX_MAX_ATTEMPTS` | No | `8` | Outbox max retries |
| `ORDER_OUTBOX_BASE_BACKOFF_MS` | No | `1200` | Outbox retry base backoff |
| `ORDER_EVENT_TIMEOUT_MS` | No | `5000` | Event publish timeout |

Example `.env`:

```env
PORT=5003
MONGO_URI=mongodb://127.0.0.1:27017/medisync_order
JWT_SECRET=your_jwt_secret
CLIENT_URL=http://localhost:3000

INVENTORY_SERVICE_URL=http://127.0.0.1:5002
INVENTORY_TIMEOUT_MS=5000
INVENTORY_CACHE_TTL_SECONDS=15

REDIS_URL=redis://127.0.0.1:6379
ORDER_CACHE_TTL_SECONDS=30
ORDER_CACHE_NAMESPACE=order:cache:

PAYMENT_EVENT_URL=http://127.0.0.1:5004/api/payments/events
ANALYTICS_EVENT_URL=http://127.0.0.1:5005/api/analytics/events
INTERNAL_SERVICE_SECRET=your_internal_secret

ORDER_OUTBOX_POLL_MS=1500
ORDER_OUTBOX_BATCH_SIZE=20
ORDER_OUTBOX_MAX_ATTEMPTS=8
ORDER_OUTBOX_BASE_BACKOFF_MS=1200
ORDER_EVENT_TIMEOUT_MS=5000
```

## Local Run

```bash
cd order-service
npm install
npm start
```

Expected logs:

```text
Order Service connected to MongoDB
Order Service running on port 5003
```

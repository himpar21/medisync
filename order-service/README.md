# MediSync Order Service (Module 3)

This service manages:
- Medicine browse (via Inventory Service)
- Cart operations
- Pickup slot selection
- Checkout and order placement
- Order history and status tracking

## Runtime Config

Use `order-service/.env`:

```env
PORT=5003
MONGO_URI=...
JWT_SECRET=...
INVENTORY_SERVICE_URL=http://127.0.0.1:5002
PAYMENT_EVENT_URL=http://127.0.0.1:5004/api/payments/events
ANALYTICS_EVENT_URL=http://127.0.0.1:5005/api/analytics/events
CLIENT_URL=http://localhost:3000
```

## Start

```bash
npm install
npm start
```

## API Base

`/api/orders`

## Main Endpoints

- `GET /medicines`
- `GET /pickup-slots`
- `GET /cart`
- `POST /cart/items`
- `PATCH /cart/items/:medicineId`
- `DELETE /cart/items/:medicineId`
- `DELETE /cart`
- `POST /checkout`
- `GET /`
- `GET /:orderId`
- `PATCH /:orderId/status` (`admin` / `pharmacist`)

## Roadmap by Objective

| Objective | Scope | Key Milestones |
| --- | --- | --- |
| Checkout reliability | Harden cart lock/idempotency; improve error messages; add request tracing for checkout path | Lock visibility in cart payload; retry-safe payment handoff; trace IDs added to logs |
| Payment sync | Make `/internal/:orderId/payment-status` robust to retries; signature validation via `INTERNAL_SERVICE_SECRET`; alert on mismatch | Signature check on all callbacks; exponential backoff for payment updates; alerts on 5xx |
| Inventory consistency | Guarantee stock release on cancel/timeout; reconcile reserve vs deduct outcomes; add dead-letter for failed releases | Background reconciler job; DLQ for release failures; metrics on reserve/deduct latency |
| Analytics coverage | Ensure `order.created` and `order.status_updated` emit full payloads; add event schema tests | Contract tests with analytics-service; schema validation in CI; event volume dashboard |
| Admin operations | Refine status transitions; add audit trail surfacing in admin UI; bulk status update tooling | Transition matrix documented; status history exposed via API; bulk patch endpoint guarded by role |

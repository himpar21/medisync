# MediSync Order Service (Module 3)

This service manages:
- Medicine browse (via Inventory Service, with local fallback catalog for dev)
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

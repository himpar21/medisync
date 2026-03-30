# MediSync

MediSync is a microservices-based medicine ordering platform with:
- user authentication and role-based access
- medicine catalog and stock management
- cart, checkout, and order lifecycle
- Stripe payment integration
- analytics aggregation for admin/pharmacist dashboards

This monorepo contains a React client, an API gateway, and five domain services.

## Services At A Glance

| Module | Port | Purpose |
| --- | --- | --- |
| `client` | `3000` | Web UI (shop, cart, checkout, orders, profile, admin dashboard) |
| `gateway-service` | `5000` | API entrypoint, JWT enforcement, request forwarding, gateway cache |
| `auth-service` | `5001` | Registration, login, profile, user listing |
| `inventory-service` | `5002` | Medicines, stock/batch operations, alerts |
| `order-service` | `5003` | Cart, checkout, order history, order status |
| `payment-service` | `5004` | Payment intents, payment records, order-payment sync |
| `analytics-service` | `5005` | Event ingestion and reporting APIs |

## High-Level Architecture

1. Client sends all API requests to Gateway (`:5000`).
2. Gateway validates authorization and routes requests to the target service.
3. Services communicate synchronously over HTTP where needed (for example `order -> inventory`).
4. Services communicate asynchronously using event endpoints with outbox + inbox patterns.
5. Redis-backed caches are used across services with in-memory fallback.

## Detailed Documentation (Per Service)

Use these docs for full endpoint-level behavior, payload contracts, validations, status codes, side effects, caching, and event flow:

- [Gateway Service](gateway-service/README.md)
- [Auth Service](auth-service/readme.md)
- [Inventory Service](inventory-service/README.md)
- [Order Service](order-service/README.md)
- [Payment Service](payment-service/README.md)
- [Analytics Service](analytics-service/README.md)
- [Client App](client/README.md)

## Quick Setup

## Prerequisites

- Node.js 18+ (Node 22+ recommended)
- npm 9+
- MongoDB
- Redis (recommended; services fall back to local memory if unavailable)
- Stripe test keys (for payment flow)

## Install Dependencies

```bash
cd gateway-service && npm install
cd ../auth-service && npm install
cd ../inventory-service && npm install
cd ../order-service && npm install
cd ../payment-service && npm install
cd ../analytics-service && npm install
cd ../client && npm install
```

## Configure Environment

Create `.env` files for each backend service and (optionally) client.

Required shared settings:
- `JWT_SECRET` should match across Gateway + Auth + Inventory + Order + Payment + Analytics.
- `INTERNAL_SERVICE_SECRET` should match across internal event producers/consumers.
- `REDIS_URL` should point to the same Redis instance if you want shared/distributed caching.

Detailed env templates are documented in each service README listed above.

## Run Locally

Start each backend service in separate terminals:

```bash
cd auth-service && npm start
cd inventory-service && npm start
cd order-service && npm start
cd payment-service && npm start
cd analytics-service && npm start
cd gateway-service && npm start
```

Start frontend:

```bash
cd client && npm start
```

Open:
- Frontend: `http://localhost:3000`
- Gateway health: `http://localhost:5000/health`

## Core Design Principles Implemented

- Inter-service communication: gateway routing + internal HTTP clients + signed internal callbacks.
- Concurrency and consistency: optimistic concurrency, cart lock, idempotent checkout, stock reserve/release flow.
- Caching: Redis-first caches with local-memory fallback and write-triggered invalidation.
- Event-driven async processing: outbox workers, retries with backoff, inbox deduplication by `eventId`.

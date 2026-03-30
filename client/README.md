# Client Application

`client` is the React frontend for MediSync.

Default port: `3000`

## Responsibilities

1. User authentication (login/register/logout session state).
2. Medicine browsing and detail view.
3. Cart and checkout UX.
4. Stripe payment completion flow.
5. Order history and order detail UX.
6. Profile management.
7. Admin/pharmacist dashboard for operational controls and analytics.

## Tech Stack

- React 18
- React Router v6
- Axios
- React Hot Toast
- Stripe React SDK (`@stripe/react-stripe-js`, `@stripe/stripe-js`)

## Application Routes

Defined in `src/App.js`:

| Route | Access | Purpose |
| --- | --- | --- |
| `/login` | Public | Login screen |
| `/register` | Public | Register screen |
| `/shop` | Public | Medicine listing and filters |
| `/medicines/:medicineId` | Public | Medicine detail page |
| `/cart` | Authenticated | Cart management |
| `/checkout` | Authenticated | Pickup/address checkout |
| `/orders` | Authenticated | Order history with expand/collapse detail |
| `/payments/:orderId` | Authenticated | Stripe payment page |
| `/order-placed` | Authenticated | Post-order confirmation |
| `/profile` | Authenticated | Profile view/update |
| `/dashboard` | `admin`/`pharmacist` | Admin dashboard and management |

## Authentication Model

Context: `src/context/AuthContext.js`

Stored values in `localStorage`:
- `token`
- `role` (normalized; `patient` -> `student`)
- `userId`
- `name`
- `email`
- `gender`
- `block`
- `roomNo`

Axios interceptor (`src/services/api.js`) automatically adds:

```http
Authorization: Bearer <token>
```

## Cart State Model

Context: `src/context/CartContext.js`

Capabilities:
- `refreshCart()`
- `addItem(medicineId, quantity)`
- `updateItem(medicineId, quantity)`
- `removeItem(medicineId)`
- `clearCart()`

Cart is automatically refreshed on login and reset on logout.

## Service Layer API Mapping

All calls go through gateway base URL (`REACT_APP_API_URL` or `http://localhost:5000`).

### Auth service (`src/services/authService.js`)
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/profile`
- `PATCH /api/auth/profile`
- `GET /api/auth/users`

### Inventory service (`src/services/inventoryService.js`)
- `GET /api/inventory/medicines`
- `GET /api/inventory/medicines/:medicineId`
- `GET /api/inventory/categories`
- `POST /api/inventory/medicines`
- `PUT /api/inventory/medicines/:medicineId`
- `DELETE /api/inventory/medicines/:medicineId`
- `PATCH /api/inventory/medicines/:medicineId/stock`
- `GET /api/inventory/alerts/low-stock`
- `GET /api/inventory/alerts/expiry`

Fallback behavior:
- if direct inventory medicine fetch fails, client falls back to `order-service` medicine list API.

### Order service (`src/services/orderService.js`)
- `GET /api/orders/medicines`
- `GET /api/orders/pickup-slots`
- `GET /api/orders/cart`
- `POST /api/orders/cart/items`
- `PATCH /api/orders/cart/items/:medicineId`
- `DELETE /api/orders/cart/items/:medicineId`
- `DELETE /api/orders/cart`
- `POST /api/orders/checkout` (sends generated `Idempotency-Key`)
- `GET /api/orders`
- `GET /api/orders/:orderId`

### Payment service (`src/services/paymentService.js`)
- `GET /api/payments/config`
- `POST /api/payments/create`
- `POST /api/payments/sync`
- `GET /api/payments/order/:orderId`

### Analytics service (`src/services/analyticsService.js`)
- `GET /api/analytics/summary`
- `GET /api/analytics/sales/daily`
- `GET /api/analytics/medicines/top`
- `GET /api/analytics/users/activity`

## UI Flow Details

## Shop and Medicine Details

- Shop page loads categories + medicine list.
- Filters/search query APIs are used to narrow list.
- Clicking an item opens `/medicines/:medicineId`.

## Cart and Checkout

1. User adds items from shop or medicine page.
2. Cart context updates local UI with server cart response.
3. Checkout captures address + pickup slot.
4. Client calls `/api/orders/checkout` with generated idempotency key.
5. On success user is routed to payment flow (`/payments/:orderId`) or order confirmation paths as applicable.

## Payments

Payment page flow:
1. Fetch Stripe config (`publishableKey`).
2. Create/reuse payment intent (`/api/payments/create`) to get `clientSecret`.
3. Confirm card payment through Stripe Elements.
4. Call `/api/payments/sync` to synchronize final status.
5. Navigate user based on outcome.

## Orders Page

- Collapsed card preview shows only first 3 items.
- If more items exist, it shows a `+N` card.
- Expanded section shows full medicine details for all items.
- Includes actions:
  - complete payment (for pending payment orders)
  - rate order
  - order again

## Admin Dashboard

Accessible to `admin` and `pharmacist`.

Core capabilities:
- medicine management (create/update/delete/stock adjustment)
- low-stock and expiry monitoring
- payment and order operational views
- analytics summary, daily sales, top medicines, user activity

## Configuration

Create `client/.env` (optional):

```env
REACT_APP_API_URL=http://localhost:5000
```

If omitted, client defaults to `http://localhost:5000`.

## Local Run

```bash
cd client
npm install
npm start
```

Production build:

```bash
npm run build
```

## Scripts

| Script | Description |
| --- | --- |
| `npm start` | Start development server |
| `npm run build` | Create production build |
| `npm test` | Run tests |
| `npm run eject` | Eject CRA config |

## Troubleshooting

- Blank data / API failures:
  - verify gateway is running on configured `REACT_APP_API_URL`.
- Unauthorized errors after login:
  - ensure token exists in localStorage and `JWT_SECRET` matches across backend services.
- Stripe payment UI errors:
  - check payment service Stripe keys and `/api/payments/config` response.

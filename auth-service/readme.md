# Auth Service

`auth-service` manages account lifecycle and identity for MediSync:
- registration
- login + JWT issuance
- profile read/update
- privileged user listing

Default port: `5001`  
API base path: `/api/auth`

## Data Model

Primary model: `User`

Key fields:
- `name` (required)
- `email` (required, unique, lowercase)
- `password` (required, hashed via bcrypt pre-save hook)
- `role` in `admin | pharmacist | student | patient`
- student/patient-only fields:
  - `gender` in `male | female`
  - `block` (validated against allowed blocks by gender)
  - `roomNo`

Concurrency: model uses `optimisticConcurrency: true`.

## Role Notes

- Auth logic normalizes `patient` to `student` for token and authorization behavior.
- Public registration rejects creation of `admin`.

## Endpoint Reference

All routes are mounted under `/api/auth`.

## `POST /register`

Create a new account.

Authentication: Public

Request body:

```json
{
  "name": "Alice",
  "email": "alice@example.com",
  "password": "Pass1234",
  "role": "student",
  "gender": "female",
  "block": "RJT",
  "roomNo": "203"
}
```

Validation rules:
- `role` must resolve to one of `student` or `pharmacist` for public registration.
- `admin` creation is blocked.
- password must be at least 8 chars and include letters + numbers.
- For student/patient role: `gender`, `block`, and `roomNo` are required.
- `block` must match allowed list based on gender.

Success response (`201`):

```json
{
  "message": "User registered successfully",
  "user": {
    "id": "65f...",
    "name": "Alice",
    "email": "alice@example.com",
    "role": "student",
    "gender": "female",
    "block": "RJT",
    "roomNo": "203",
    "createdAt": "2026-03-30T10:00:00.000Z",
    "updatedAt": "2026-03-30T10:00:00.000Z"
  }
}
```

Possible errors:
- `400` invalid role/password or missing fields
- `403` admin creation attempt
- `409` duplicate email
- `500` server error

Side effects:
- invalidates cached profile/user-list entries
- enqueues event `auth.user_registered` for analytics

## `POST /login`

Authenticate a user and return JWT.

Authentication: Public

Request body:

```json
{
  "email": "alice@example.com",
  "password": "Pass1234"
}
```

Success response (`200`):

```json
{
  "message": "Login successful",
  "token": "<JWT>",
  "user": {
    "id": "65f...",
    "name": "Alice",
    "email": "alice@example.com",
    "role": "student",
    "gender": "female",
    "block": "RJT",
    "roomNo": "203",
    "createdAt": "2026-03-30T10:00:00.000Z",
    "updatedAt": "2026-03-30T10:00:00.000Z"
  }
}
```

Possible errors:
- `400` missing credentials / invalid password
- `404` user not found
- `500` server error

## `GET /profile`

Return current authenticated user profile.

Authentication: Required (`Bearer JWT`)

Success response (`200`):

```json
{
  "user": {
    "id": "65f...",
    "name": "Alice",
    "email": "alice@example.com",
    "role": "student",
    "gender": "female",
    "block": "RJT",
    "roomNo": "203",
    "createdAt": "2026-03-30T10:00:00.000Z",
    "updatedAt": "2026-03-30T10:00:00.000Z"
  }
}
```

Possible errors:
- `401` missing/invalid token
- `404` user not found

Cache:
- cache key: `auth:profile:<userId>`
- TTL: `60s` in controller call

## `PATCH /profile`

Update current authenticated user profile.

Authentication: Required (`Bearer JWT`)

Allowed fields:
- `name`
- `password` (must satisfy strength policy)
- for student/patient users: `gender`, `block`, `roomNo`

Request body example:

```json
{
  "name": "Alice S",
  "password": "NewPass123",
  "block": "RJT",
  "roomNo": "305"
}
```

Success response (`200`):

```json
{
  "message": "Profile updated successfully",
  "user": {
    "id": "65f...",
    "name": "Alice S",
    "email": "alice@example.com",
    "role": "student",
    "gender": "female",
    "block": "RJT",
    "roomNo": "305",
    "createdAt": "2026-03-30T10:00:00.000Z",
    "updatedAt": "2026-03-30T10:10:00.000Z"
  }
}
```

Possible errors:
- `400` invalid password or student details
- `401` missing/invalid token
- `404` user not found
- `409` optimistic concurrency conflict

Side effects:
- invalidates profile and user-list cache keys
- enqueues `auth.user_updated` event

## `GET /users`

List users (max 200) sorted by newest first.

Authentication: Required (`Bearer JWT`)  
Authorization: `admin` or `pharmacist`

Success response (`200`):

```json
{
  "items": [
    {
      "id": "65f...",
      "name": "Alice",
      "email": "alice@example.com",
      "role": "student",
      "gender": "female",
      "block": "RJT",
      "roomNo": "203",
      "createdAt": "2026-03-30T10:00:00.000Z",
      "updatedAt": "2026-03-30T10:00:00.000Z"
    }
  ]
}
```

Possible errors:
- `401` unauthorized
- `403` forbidden role

Cache:
- key: `auth:users:list`
- TTL: `30s`

## Caching

Cache module: `src/services/userCache.js`

- Redis-first cache, in-memory fallback
- Namespace default: `auth:cache:`
- Supports:
  - `get(key)`
  - `set(key, value, ttl)`
  - `del(key)`
  - `delByPrefix(prefix)`

Important invalidation points:
- register -> invalidate user list + possible profile
- profile update -> invalidate profile + user list

## Event Publishing

Worker file: `src/services/eventPublisher.js`

Published to `ANALYTICS_EVENT_URL` with retries/backoff:
- `auth.user_registered`
- `auth.user_updated`

Runtime behavior:
- in-memory queue
- periodic worker (`AUTH_EVENT_POLL_MS`)
- max attempts (`AUTH_EVENT_MAX_ATTEMPTS`)
- exponential backoff + jitter

## Health Endpoint

`GET /health` returns:

```json
{
  "message": "Auth Service is running perfectly!"
}
```

## Environment Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `PORT` | No | `5001` | Service port |
| `MONGO_URI` | Yes | N/A | MongoDB connection string |
| `JWT_SECRET` | Yes | N/A | JWT signing/verify secret |
| `JWT_EXPIRES_IN` | No | `1d` | Token expiry |
| `REDIS_URL` | No | empty | Redis URL |
| `AUTH_CACHE_TTL_SECONDS` | No | `45` | Default cache TTL |
| `AUTH_CACHE_NAMESPACE` | No | `auth:cache:` | Cache namespace |
| `ANALYTICS_EVENT_URL` | No | empty | Analytics event ingest URL |
| `INTERNAL_SERVICE_SECRET` | No | empty | Signature for internal events |
| `AUTH_EVENT_POLL_MS` | No | `1200` | Event worker poll interval |
| `AUTH_EVENT_MAX_ATTEMPTS` | No | `6` | Max publish retries |
| `AUTH_EVENT_TIMEOUT_MS` | No | `4000` | Event publish timeout |

Example `.env`:

```env
PORT=5001
MONGO_URI=mongodb://127.0.0.1:27017/medisync_auth
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=1d

REDIS_URL=redis://127.0.0.1:6379
AUTH_CACHE_TTL_SECONDS=45
AUTH_CACHE_NAMESPACE=auth:cache:

ANALYTICS_EVENT_URL=http://127.0.0.1:5005/api/analytics/events
INTERNAL_SERVICE_SECRET=your_internal_secret
AUTH_EVENT_POLL_MS=1200
AUTH_EVENT_MAX_ATTEMPTS=6
AUTH_EVENT_TIMEOUT_MS=4000
```

## Local Run

```bash
cd auth-service
npm install
npm start
```

Expected logs:

```text
Auth Service connected to MongoDB
Auth Service is running on port 5001
```

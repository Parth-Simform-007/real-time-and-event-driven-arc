# RideWave — Phase 1 Testing & Learning Guide

> **Audience:** You, the developer, after building Phase 1 (Weeks 1–3).
> **Goal of this doc:** (1) Confirm every Phase 1 requirement is covered, (2) show you exactly how to test the whole system end-to-end as a dev, and (3) explain every library & concept used so you actually *understand* what you built — not just that it runs.

---

## Part A — Phase 1 Requirement Coverage

This is the audit of the current code against the **Phase 1 roadmap (Weeks 1–3)** in the architecture plan.

### Week 1 — Monorepo, DB, Health

| # | Requirement | Status | Where |
|---|-------------|--------|-------|
| 1 | NestJS monorepo (`nest-cli.json`, 5 apps) | ✅ Done | `nest-cli.json` — 5 apps + `common` & `events` libs |
| 2 | Each service: module + controller + service | ✅ Done | `apps/*/src/**` |
| 3 | Docker Compose: Postgres + RabbitMQ + services | ✅ Done | `infrastructure/docker-compose.yml` |
| 4 | Each service → its own Postgres via TypeORM | ✅ Done | `apps/*/src/app.module.ts` (`TypeOrmModule.forRootAsync`) |
| 5 | **First migration for `users` table** | ⚠️ **Partial** | Uses `synchronize: true` (auto-schema), not a real migration. See Gap #2. |
| 6 | Health endpoint in every service | ✅ Done | `apps/*/src/health/health.controller.ts` (Terminus) |

### Week 2 — Auth & User Service

| # | Requirement | Status | Where |
|---|-------------|--------|-------|
| 1 | Register + login | ✅ Done | `user-service/.../auth/auth.controller.ts` |
| 2 | JWT access + refresh token pattern | ✅ Done | `auth.service.ts`, `refresh-token.entity.ts` |
| 3 | Protect Gateway routes with JWT guard | ✅ Done | `api-gateway/.../auth/jwt-auth.guard.ts` + `proxy.controller.ts` |
| 4 | **RBAC via `@Roles()` custom decorator** | ❌ **Missing** | Role is in the JWT & forwarded as `x-user-role`, but there is no `@Roles()` decorator or `RolesGuard`. See Gap #1. |
| 5 | bcrypt password hashing | ✅ Done | `users.service.ts` (`bcrypt.hash(pw, 12)`) |

### Week 3 — Ride Service & Event-Driven Comms

| # | Requirement | Status | Where |
|---|-------------|--------|-------|
| 1 | Ride lifecycle: request→match→start→complete→cancel | ✅ Done | `rides.service.ts` (state-machine guards on every transition) |
| 2 | RabbitMQ connection in **all** services | ⚠️ **Partial** | Connected: ride (publisher), notification + payment (consumers). **Not** connected: user-service, api-gateway. See Gap #3. |
| 3 | Ride publishes `ride.requested` | ✅ Done (+`matched`/`completed`/`cancelled`) | `event-publisher.service.ts` |
| 4 | Notification subscribes & logs | ✅ Done | `notification-service/.../event-consumer.service.ts` |
| 5 | Event envelope (eventId, correlationId, version) | ✅ Done | `libs/events/src/event-envelope.ts` |
| 6 | Idempotency check in Notification Service | ✅ Done | `ProcessedEvent` entity + `isAlreadyProcessed`/`markProcessed` |

### Gaps / Follow-ups (none block Phase 1 demo, but worth knowing)

1. **`@Roles()` RBAC decorator is not implemented.** The pieces exist (`UserRole` enum, `role` in JWT, `x-user-role` header forwarded by the gateway), so adding a `RolesGuard` + `@Roles()` decorator is a small, well-scoped task. This is the only *functional* miss against the Week 2 checklist.
2. **No real TypeORM migration.** All schemas are created by `synchronize: true`, which auto-syncs entities to tables. Great for learning speed, **never use in production** (it can drop columns). The roadmap explicitly wants you to *learn* migrations, so generating one `CreateUsers` migration is recommended practice.
3. **`user-service` and `api-gateway` don't open a RabbitMQ connection.** That's fine for Phase 1 (neither has an event to publish yet — `user.verified` is Phase 2), but the roadmap says "all services," so be aware it's deferred, not done.
4. **Minor — envelope duplication.** `event-publisher.service.ts` builds the envelope inline instead of importing `createEventEnvelope()` from `libs/events`. Same shape, but the shared helper exists to prevent drift — worth switching to it.
5. **Minor — payment consumer has no idempotency check** (only Notification does). Phase 1 only required idempotency in Notification; payment idempotency + DLQ is a Phase 2 item.
6. **`driver_docs` table** from the schema table isn't built — it belongs to the Phase 2 driver-verification flow, not Weeks 1–3.

---

## Part B — Prerequisites & Running Everything

### 1. Start infrastructure (Postgres ×4 + RabbitMQ)

```bash
cd infrastructure
docker compose up -d rabbitmq db-users db-rides db-payments db-notifications
docker compose ps          # all should be "healthy"
```

| Service | Host port | Notes |
|---------|-----------|-------|
| RabbitMQ AMQP | 5672 | what the apps connect to |
| RabbitMQ UI | 15672 | browser: http://localhost:15672 (guest/guest) |
| db-users | 5432 | `ridewave_users` |
| db-rides | 5433 | `ridewave_rides` |
| db-payments | 5434 | `ridewave_payments` |
| db-notifications | 5435 | `ridewave_notifications` |

> ⚠️ The host ports differ (5432–5435) so the four Postgres containers don't collide. Inside Docker they're all `5432`. pgAdmin connects to the **host** ports.

### 2. Start all 5 services in watch mode

```bash
# from repo root
npm install
npm run start:dev:all
```

You'll see each service print its startup banner with URL / DB / RabbitMQ once it's up. Watch the **notification** and **payment** logs say `consumer started` — that confirms the AMQP connection.

> Running services on the host? Set `RABBITMQ_URL=amqp://guest:guest@localhost:5672` and the `DB_*` vars to the host ports above, or just run everything via `docker compose up`.

### 3. Sanity check — health endpoints

```bash
curl -s localhost:3000/api/health   # api-gateway (pings user-service)
curl -s localhost:3001/api/health   # user-service (pings its DB)
curl -s localhost:3002/api/health   # ride-service
curl -s localhost:3003/api/health   # payment-service
curl -s localhost:3004/api/health   # notification-service
```

Each returns `{"status":"ok", ...}`. A `503` with `"error"` means the dependency (DB / upstream) is down — that's the health check doing its job.

---

## Part C — End-to-End Test Walkthrough

This walks the **full ride saga** through the API Gateway, exactly how a real client would. It exercises: JWT auth → gateway routing → ride state machine → event publish → RabbitMQ → both consumers → idempotency → DB rows.

### Step 1 — Register a rider (gets you a JWT)

```bash
curl -s -X POST localhost:3000/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"rider@test.com","password":"password123","fullName":"Test Rider","phone":"+15550001111","role":"RIDER"}'
```

Returns `{ user, accessToken, refreshToken }`. **Copy the `accessToken`.**

```bash
TOKEN="paste-access-token-here"
```

**What to verify:** password is never returned (sanitized), and a row exists in `users` + `refresh_tokens` (check via pgAdmin on port 5432).

### Step 2 — Login (proves bcrypt compare + token issuance)

```bash
curl -s -X POST localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"rider@test.com","password":"password123"}'
```

Try a wrong password → expect `401 Invalid credentials`.

### Step 3 — Hit a protected route WITHOUT a token (proves the guard)

```bash
curl -s localhost:3000/api/users/some-id            # expect 401 Unauthorized
curl -s localhost:3000/api/users/some-id -H "authorization: Bearer $TOKEN"   # expect 200 / user lookup
```

This is the JWT guard at the gateway in action. The gateway validates the token locally, then forwards `x-user-id` + `x-user-role` headers downstream.

### Step 4 — Request a ride (publishes `ride.requested`)

```bash
curl -s -X POST localhost:3000/api/rides \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"pickupAddress":"5th Ave","pickupLat":40.741,"pickupLng":-73.989,"dropoffAddress":"JFK","dropoffLat":40.641,"dropoffLng":-73.778}'
```

Returns a ride with `status: REQUESTED` and an `id`. **Copy the ride `id`.**

```bash
RIDE="paste-ride-id-here"
```

**Now look at three places at once:**
- **notification-service logs:** `[NOTIFY] Ride requested ...` then `Processed ride.requested [eventId=...]`
- **payment-service logs:** `[Payment] Received ride.requested ...` (it creates a pending payment row)
- **RabbitMQ UI** → Queues → `notification.rides` and `payment.rides` show messages flowing.

### Step 5 — Drive the state machine

```bash
# Match a driver (REQUESTED → MATCHED) → publishes ride.matched
curl -s -X PATCH localhost:3000/api/rides/$RIDE/match \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"driverId":"driver-123","estimatedArrivalMinutes":4}'

# Start (MATCHED → IN_PROGRESS) — no event
curl -s -X PATCH localhost:3000/api/rides/$RIDE/start -H "authorization: Bearer $TOKEN"

# Complete (IN_PROGRESS → COMPLETED) → publishes ride.completed
curl -s -X PATCH localhost:3000/api/rides/$RIDE/complete \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"fareAmount":42.50}'
```

**Test the state machine guards (this is the important learning bit):** try to `complete` a ride that was never started, or `match` an already-matched ride:

```bash
curl -s -X PATCH localhost:3000/api/rides/$RIDE/match -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"driverId":"x"}'
# expect: 400 "Cannot match ride in status COMPLETED"
```

That `400` is the state machine refusing an illegal transition — exactly what `rides.service.ts` enforces.

### Step 6 — Ride history & status query

```bash
curl -s localhost:3000/api/rides/history -H "authorization: Bearer $TOKEN"   # all rides for this rider
curl -s localhost:3000/api/rides/$RIDE   -H "authorization: Bearer $TOKEN"   # one ride
```

### Step 7 — **Prove idempotency** (the headline Week 3 concept)

The Notification Service must never send the same notification twice for the same `eventId`. To test it, **re-deliver an event** and confirm it's skipped.

Easiest way — use the RabbitMQ UI to publish a duplicate:

1. Open http://localhost:15672 → **Exchanges** → `ride-events`.
2. Publish a message with **routing key** `ride.requested` and this payload (reuse an `eventId` you already saw in the notification logs):
   ```json
   {"eventId":"PASTE-AN-ALREADY-PROCESSED-UUID","eventType":"ride.requested","version":"1.0","timestamp":"2026-06-05T10:00:00Z","sourceService":"manual-test","correlationId":"test","payload":{"rideId":"r1","riderId":"u1","pickupLocation":{"address":"x"}}}
   ```
3. Watch the notification logs:
   ```
   [IDEMPOTENCY] Skipping duplicate eventId=... type=ride.requested
   ```
   The notification is **not** re-sent, and the message is `ack`ed. That's the `processed_events` table doing its job.

A fresh `eventId` in the same message → processed normally. That contrast *is* the idempotency lesson.

### Step 8 — Inspect the data (DB-per-service isolation)

Open pgAdmin (or `psql`) against each DB and confirm each service owns only its own data:

```sql
-- ridewave_users (5432):  SELECT * FROM users;  SELECT * FROM refresh_tokens;
-- ridewave_rides (5433):  SELECT id, status, "riderId", "fareAmount" FROM rides;
-- ridewave_payments (5434): SELECT * FROM payments;
-- ridewave_notifications (5435): SELECT * FROM processed_events;
```

> The **DB-isolation rule**: notice no service can see another's tables. Ride data lives only in `ridewave_rides`; notification's dedupe log lives only in `ridewave_notifications`. That separation is the whole point of database-per-service.

### Step 9 — Cancellation path (compensation preview)

```bash
# request a new ride, then:
curl -s -X PATCH localhost:3000/api/rides/$RIDE2/cancel -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"cancelledBy":"rider","reason":"changed my mind"}'
```

Publishes `ride.cancelled` → notification logs the cancellation. (The actual *payment release* compensation is wired up properly in Phase 2's Saga work.)

---

## Part D — Learn Everything You Used in Phase 1

For each tool: **what it is → where it's used in RideWave → what to actually study.** Go in this order; each builds on the previous.

### 1. NestJS — Modules, DI, Decorators (the backbone)
- **What:** An opinionated Node framework. Everything is a **module** that wires together **providers** (services) and **controllers**. Dependencies are injected via the constructor (**Dependency Injection**) — you never `new` a service yourself.
- **In RideWave:** every `*.module.ts`. Look at `user-service/src/app.module.ts` — it `imports` `ConfigModule`, `TypeOrmModule`, `UsersModule`, `AuthModule`. `AuthService` receives `UsersService`, `JwtService`, `ConfigService` in its constructor — that's DI.
- **Study:** Modules, Providers, Controllers, custom Providers, and the request lifecycle (Guards → Interceptors → Pipes → Controller). Decorators to know: `@Module`, `@Injectable`, `@Controller`, `@Get/@Post/@Patch`, `@Body/@Param/@Headers`, `@UseGuards`.
- **Exercise:** trace one request: `POST /api/rides` → Gateway `ProxyController` → `ProxyService.forward` → ride-service `RidesController.requestRide` → `RidesService` → `EventPublisherService`.

### 2. TypeORM + PostgreSQL (persistence)
- **What:** An ORM — you define `@Entity` classes and TypeORM maps them to tables; `Repository<T>` gives you `.find/.save/.create`.
- **In RideWave:** `user.entity.ts`, `ride.entity.ts`, `payment.entity.ts`, `processed-event.entity.ts`. `TypeOrmModule.forRootAsync` in each `app.module.ts` connects to that service's DB. `@InjectRepository(Ride)` in `RidesService` gives you the repo.
- **Key concept — `synchronize: true`:** auto-creates/updates tables from entities at boot. Convenient now, dangerous in prod. **Learn migrations next** (`typeorm migration:generate`) — that's Gap #2 and a real Week 1 learning goal.
- **Study:** entities & column decorators (`@PrimaryGeneratedColumn('uuid')`, `@Column`, `@CreateDateColumn`, relations like `@OneToMany`), the Repository API, and migrations vs synchronize.

### 3. class-validator + ValidationPipe (input safety)
- **What:** Decorator-based DTO validation. `ValidationPipe` (set globally in every `main.ts`) rejects bad request bodies automatically.
- **In RideWave:** `register.dto.ts` (`@IsEmail`, `@MinLength(8)`, `@IsEnum`), `request-ride.dto.ts` (`@IsNumber`, `@IsNotEmpty`).
- **Test it:** `POST /api/auth/register` with `"password":"123"` → `400` because of `@MinLength(8)`. `whitelist: true` also strips unknown fields.
- **Study:** common validators, `whitelist`/`forbidNonWhitelisted`, `transform: true`.

### 4. Passport + JWT (authentication)
- **What:** Passport is an auth-strategy framework; `passport-jwt` is the JWT strategy. `@nestjs/jwt` signs/verifies tokens.
- **In RideWave:** `auth.service.ts` signs **access** (15m) + **refresh** (7d) tokens. `jwt.strategy.ts` validates the bearer token and returns the user payload. `jwt-auth.guard.ts` + `@UseGuards(JwtAuthGuard)` protect routes.
- **The access/refresh pattern:** short-lived access token used on every call; long-lived refresh token (hashed and stored in `refresh_tokens`) used to mint new access tokens via `POST /api/auth/refresh`.
- **Study:** what's *inside* a JWT (header.payload.signature — decode one at jwt.io), why it's stateless, why refresh tokens are stored hashed, and the Passport strategy → guard flow.

### 5. bcrypt (password hashing)
- **What:** A slow, salted one-way hash. You store the hash, never the password; you `compare` on login.
- **In RideWave:** `users.service.ts` — `bcrypt.hash(pw, 12)` (12 = cost factor / work) and `bcrypt.compare`.
- **Study:** why slow hashing beats SHA-256 for passwords, what the cost factor does, why salts prevent rainbow tables.

### 6. RabbitMQ + amqplib (event-driven messaging) — the heart of Phase 1
- **What:** A message broker. Publishers send to an **exchange**; the exchange routes to **queues** by binding rules; consumers read queues. A **topic** exchange routes by pattern (`ride.requested`, `ride.*`).
- **In RideWave:**
  - **Publisher:** `ride-service/.../event-publisher.service.ts` — asserts the `ride-events` topic exchange, publishes envelopes with a routing key = event type.
  - **Consumers:** notification (`notification.rides`) and payment (`payment.rides`) queues, each **bound** to the `ride-events` exchange for the routing keys they care about.
  - **`prefetch(1)`** = process one message at a time. **`ack`** = "done, delete it." **`nack(msg, false, false)`** = "failed, don't requeue" (Phase 1 has no DLQ yet → Phase 2).
- **Study:** exchanges (topic vs fanout vs direct), bindings & routing keys, ack/nack, durability (`durable: true` survives broker restart), prefetch/QoS, and *why* pub/sub decouples producers from consumers. **Use the Management UI (15672)** — watch messages, queues, and bindings live. This is the single most valuable thing to play with.

### 7. The Event Envelope + Idempotency (distributed-systems correctness)
- **What:** A standard wrapper around every event: `eventId`, `eventType`, `version`, `timestamp`, `sourceService`, `correlationId`, `payload`. The `eventId` enables **idempotency**: a consumer records every `eventId` it has handled and skips duplicates.
- **In RideWave:** `libs/events/src/event-envelope.ts` (shape + `createEventEnvelope`). Idempotency in `notifications.service.ts` via the `processed_events` table (`isAlreadyProcessed` / `markProcessed`).
- **Why it matters:** message brokers guarantee *at-least-once* delivery — duplicates happen. Without idempotency you'd send duplicate SMS or double-charge. `correlationId` lets you trace one user action across all services (foundation for distributed tracing in Phase 3).
- **Study:** at-least-once vs exactly-once, why exactly-once is effectively achieved via idempotent consumers, and the "process → then mark processed → then ack" ordering (and why that order matters for crash safety).

### 8. NestJS Terminus (health checks)
- **What:** Health-check module. `/api/health` returns ok/down and the status of dependencies.
- **In RideWave:** ride/payment/notification/user ping their **DB** (`TypeOrmHealthIndicator`); the gateway pings the **user-service** over HTTP (`HttpHealthIndicator`).
- **Study:** liveness vs readiness probes (this is what Kubernetes calls in Phase 4), and why a service should report unhealthy when its DB is unreachable.

### 9. API Gateway pattern (@nestjs/axios proxy)
- **What:** One public entry point. It authenticates, then forwards to the right internal service, injecting identity headers.
- **In RideWave:** `proxy.controller.ts` routes `auth/*` (public), `users/*` `rides/*` `payments/*` (JWT-guarded) to the upstream URLs; `proxy.service.ts` forwards with `HttpService` and adds `x-user-id`, `x-user-role`, `x-correlation-id`.
- **Study:** why a gateway centralizes cross-cutting concerns (auth, logging, correlation IDs, later rate-limiting/circuit-breaking), and the trade-off vs clients calling services directly.

### 10. Docker Compose (local environment)
- **What:** Declaratively runs the whole stack (4 Postgres + RabbitMQ + 5 services) on one network where services reach each other by name (`db-users`, `rabbitmq`).
- **In RideWave:** `infrastructure/docker-compose.yml`. Note `depends_on … condition: service_healthy` — services wait for the DB/broker to be *healthy*, not just started (this is why your `healthcheck` blocks matter).
- **Study:** services, volumes (data persistence across restarts), networks & service-name DNS, `depends_on` + healthchecks, and host-vs-container ports (the 5432–5435 mapping).

### 11. NestJS Monorepo (project structure)
- **What:** One repo, many apps + shared libs, configured in `nest-cli.json`. `libs/common` (DTOs, decorators, interfaces) and `libs/events` (event types) are shared across services.
- **Study:** `nest build <app>` / `nest start --watch <app>`, path aliases for `@app/common` style imports, and why shared *contracts* (event shapes) live in a lib so services don't drift.

---

## Suggested Order to Test & Learn

1. `docker compose up` infra → confirm RabbitMQ UI + 4 DBs are healthy.
2. `npm run start:dev:all` → watch the 5 startup banners + the two "consumer started" lines.
3. Run **Part C Steps 1–6** (auth → full ride lifecycle) with curl.
4. Do **Step 7 (idempotency)** slowly — it's the concept that separates "it works" from "I understand distributed systems."
5. Open pgAdmin and the RabbitMQ UI side-by-side while you re-run the flow — *see* the rows and messages appear.
6. Then read **Part D** top-to-bottom, jumping to the referenced file for each tool.

## Recommended next steps (close the Phase 1 gaps)
- Add a `RolesGuard` + `@Roles()` decorator in `libs/common` and apply it to a DRIVER/ADMIN-only route (Gap #1).
- Generate one real TypeORM migration for `users` and flip `synchronize` off for user-service (Gap #2).
- Switch `event-publisher.service.ts` to use `createEventEnvelope()` from `libs/events` (Gap #4).

# RideWave — Phase 2 Development Steps (Chunked)

> The build order for Phase 2, broken into small, verifiable chunks — exactly the rhythm that worked in Phase 1.
> **Rule:** do **one step at a time**. Each step has a **Goal**, the **Files** it touches, and a **✅ Prove it works** check you must pass before starting the next step. Don't move on until the check is green.
>
> Concepts & the "why" live in [PHASE2_GUIDE.md](PHASE2_GUIDE.md). This file is the *how / in what order*.

**Sequence:** Week 4 (gRPC) → Week 5 (WebSockets) → Week 6 (Saga + DLQ).
**Hard dependency:** Week 6 needs Week 4. Week 5 is independent (can be deferred).

---

## WEEK 4 — gRPC Integration

Replace synchronous internal checks (auth validation, driver verification) with a typed gRPC contract.

### Step 4.1 — Define the contract (`user.proto`)
- **Goal:** Agree the typed contract *before* writing any implementation. No logic yet.
- **Files:** new `libs/proto/src/user.proto` (messages + `UserService` with `ValidateToken`, `GetUser`, `GetDriver`); register a `proto` lib path if needed.
- **Do:** define request/response messages and the 3 RPCs. Review the contract together — this is the "measure twice" step.
- **✅ Prove it works:** `protoc`/`proto-loader` can parse the file without error; we've reviewed every field and agreed on it.

### Step 4.2 — gRPC server in User Service
- **Goal:** User Service answers gRPC calls.
- **Packages:** `@grpc/grpc-js`, `@grpc/proto-loader` (`@nestjs/microservices` already installed).
- **Files:** `user-service/src/main.ts` (add a gRPC microservice via `connectMicroservice` + `startAllMicroservices`); a new gRPC controller implementing `ValidateToken`/`GetUser`/`GetDriver` backed by `UsersService`/JWT verify.
- **✅ Prove it works:** call the running gRPC server with `grpcurl` (or a tiny client) — `GetUser` returns a real user; `ValidateToken` returns valid/invalid for a good/bad token.

### Step 4.3 — gRPC client in API Gateway (swap auth validation)
- **Goal:** The gateway validates tokens via a **remote gRPC call** instead of local-only verification.
- **Files:** `api-gateway` — register a gRPC client for `UserService`; update the JWT validation path (strategy/guard or a small auth service) to call `ValidateToken` over gRPC.
- **✅ Prove it works:** login → call a protected route through the gateway → still 200. Stop User Service → protected route fails fast (proves the call is now remote, not local).

### Step 4.4 — Ride Service verifies the driver via gRPC
- **Goal:** Replace the hand-passed driver ID with a real existence check.
- **Files:** `ride-service` — register a gRPC client for `UserService`; in `RidesService.matchRide`, call `GetDriver` before setting status `MATCHED`; reject if the driver doesn't exist or isn't a DRIVER.
- **✅ Prove it works:** `/match` with a real driver id → succeeds; `/match` with a bogus id → 400/404 (driver not found). *(Optional: benchmark HTTP-JSON vs gRPC for `ValidateToken` and note the difference.)*

**Week 4 done when:** auth validation and driver verification both go over gRPC, and the failure cases are clean.

---

## WEEK 5 — Real-Time with WebSockets (Socket.io)

Live driver location + ride-status pushed to the rider. Largely independent of Weeks 4 & 6.

### Step 5.1 — Stand up a Socket.io gateway
- **Goal:** Clients can connect over WebSocket and the server logs connect/disconnect.
- **Packages:** `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`.
- **Files:** `api-gateway` — a `RidesGateway` (`@WebSocketGateway`) with `handleConnection`/`handleDisconnect`.
- **✅ Prove it works:** connect with a Socket.io client (or `wscat`/browser console) → server logs the connection and the disconnect.

### Step 5.2 — Rooms: rider joins a ride, driver sends location
- **Goal:** Scope messages to one ride via a room (`ride:<rideId>`).
- **Files:** `RidesGateway` — handle `ride:join` (rider joins room) and `driver:location:update` (driver emits `{lat,lng,heading,speed}`).
- **✅ Prove it works:** open two clients; driver emits a location → only the rider in that ride's room receives `ride:driver:location`; a client in a different room receives nothing.

### Step 5.3 — Push ride-status changes to the room
- **Goal:** When the ride state machine transitions, both rider and driver get `ride:status:changed`.
- **Files:** mechanism for ride-service state changes to reach the gateway socket — simplest first cut: ride-service emits an event the gateway consumes, then broadcasts to the room. (Wire it to the existing RabbitMQ events you already publish.)
- **✅ Prove it works:** drive a ride through `match`/`start`/`complete` → connected clients in that room receive a `ride:status:changed` per transition.

### Step 5.4 — Lifecycle & cleanup
- **Goal:** Handle disconnects/reconnects without leaking rooms or state.
- **Files:** `RidesGateway` — clean up room membership on disconnect; (optional) auth the socket handshake with the JWT.
- **✅ Prove it works:** disconnect a client mid-ride → no errors, no stale broadcasts; reconnect + re-join → updates resume.

**Week 5 done when:** a rider sees live driver location and status changes for *their* ride only.

---

## WEEK 6 — Saga Pattern & Distributed Transactions

Make a booking consistent across Ride + Payment, with rollback and no lost messages. **Requires Week 4.**

### Step 6.1 — Payment pre-authorization (the forward path)
- **Goal:** On ride request/match, Payment pre-authorizes and reports back.
- **Files:** `payment-service` — on `ride.requested`/`ride.matched`, create a pre-auth and publish `payment.preauth.success` / `payment.preauth.failed`; `ride-service` consumes the result and advances/blocks the ride state.
- **✅ Prove it works:** request a ride → payment row goes to `PREAUTHORIZED`; ride advances only after `payment.preauth.success`.

### Step 6.2 — Compensating transaction (the rollback)
- **Goal:** Cancelling releases the pre-auth — the rollback you don't have today.
- **Files:** `payment-service` — on `ride.cancelled`, **release** the pre-auth (status `RELEASED`) and publish `payment.released`; notification logs it.
- **✅ Prove it works:** pre-auth a ride, then cancel → payment moves `PREAUTHORIZED → RELEASED`; logs show the compensation.

### Step 6.3 — Idempotency in Payment + force a failure
- **Goal:** Payment is safe against duplicate events; the saga handles payment failure.
- **Files:** `payment-service` — add a `processed_events` check like Notification has; add a toggle/condition to make pre-auth fail on demand.
- **✅ Prove it works:** redeliver the same event id → second is skipped (no double pre-auth); force a failure → ride does **not** advance to matched and the rider is notified.

### Step 6.4 — Dead Letter Queue (no message lost)
- **Goal:** Failed messages are parked, not dropped (replaces today's `nack(…, false)` drop).
- **Files:** consumers — declare `dlx.exchange` + `dlq.payments`/`dlq.notifications`; set `x-dead-letter-exchange` on the work queues; `nack(msg, false, false)` now routes to the DLQ.
- **✅ Prove it works:** force a handler to throw → the message lands in the DLQ (visible in the RabbitMQ UI at :15672), not gone.

**Week 6 done when:** a booking pre-authorizes, a cancel releases it, payment is idempotent, and failed messages sit in a DLQ.

---

## Progress checklist

```
Week 4 — gRPC
  [ ] 4.1 user.proto defined & reviewed
  [ ] 4.2 gRPC server in user-service (grpcurl proves it)
  [ ] 4.3 gateway validates token via gRPC (fails fast when user-service down)
  [ ] 4.4 ride-service verifies driver via gRPC (bogus id rejected)

Week 5 — WebSockets
  [ ] 5.1 Socket.io gateway logs connect/disconnect
  [ ] 5.2 rooms: rider gets driver location, others don't
  [ ] 5.3 ride:status:changed pushed on each transition
  [ ] 5.4 disconnect/reconnect handled cleanly

Week 6 — Saga + DLQ
  [ ] 6.1 pre-authorization forward path
  [ ] 6.2 ride.cancelled → payment released (compensation)
  [ ] 6.3 payment idempotency + forced-failure path
  [ ] 6.4 DLQ parks failed messages
```

## Reminders
- **One step, then prove it, then next.** Resist building a whole week at once — that's how distributed bugs become unfindable.
- For each step we'll: explain the concept → implement → you test the ✅ check → questions → next step.
- Keep a running test log (curl/grpcurl commands) the way `PHASE1_TESTING.md` did — future-you will thank you.

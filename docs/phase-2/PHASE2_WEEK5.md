# RideWave — Phase 2, Week 5: Real-Time with WebSockets

> **Status:** In development  
> **Depends on:** Week 4 (gRPC integration) — must be complete first  
> **Independent of:** Week 6 (Saga + DLQ)

---

## 1. Phase 2 Overview

Phase 2 of RideWave adds three production-grade distributed systems capabilities on top of the event-driven foundation built in Phase 1:

| Week       | Capability                                                                  | Status         |
| ---------- | --------------------------------------------------------------------------- | -------------- |
| Week 4     | gRPC — typed inter-service contracts (auth validation, driver verification) | ✅ Complete    |
| **Week 5** | **WebSockets — real-time live location + ride status pushed to clients**    | 🔨 In progress |
| Week 6     | Saga + DLQ — distributed transaction consistency, no lost messages          | ⏳ Not started |

**Phase 1 left a gap:** once a rider requests a ride, they must poll HTTP endpoints to learn whether a driver was matched, whether the ride started, etc. Week 5 eliminates polling entirely by pushing state changes as they happen.

---

## 2. Week 5 Objectives

1. Establish a persistent WebSocket channel between clients and `api-gateway` using Socket.io.
2. Scope messages to individual rides via rooms (`ride:<rideId>`) so riders only see their own ride.
3. Stream live driver GPS frames from the driver's socket directly to the rider in the same room.
4. Bridge the existing RabbitMQ ride events (`ride.requested`, `ride.matched`, `ride.in_progress`, `ride.completed`, `ride.cancelled`) to WebSocket broadcasts — no polling needed.
5. Authenticate every WebSocket connection at handshake time using the existing JWT + gRPC validation chain.
6. Handle disconnect/reconnect cleanly with no stale state or memory leaks.

---

## 3. Architecture

### 3.1 System Diagram

```
Rider / Driver (browser or mobile)
          │
          │  Socket.io (WebSocket upgrade over HTTP/1.1)
          ▼
┌─────────────────────────────────────────────────────────┐
│                  api-gateway  :3000                     │
│                                                         │
│  ┌──────────────────────────────┐                       │
│  │        RidesGateway          │  NestJS @WebSocket-   │
│  │  @WebSocketGateway           │  Gateway — handles    │
│  │                              │  all socket events    │
│  │  rooms: ride:<rideId>        │                       │
│  │  events in:                  │                       │
│  │    ride:join                 │                       │
│  │    driver:location:update    │                       │
│  │  events out:                 │                       │
│  │    ride:driver:location      │                       │
│  │    ride:status:changed       │                       │
│  └──────────┬───────────────────┘                       │
│             │ broadcastRideStatus()                     │
│  ┌──────────▼───────────────────┐                       │
│  │  RidesEventConsumerService   │  amqplib consumer     │
│  │  queue: websocket.rides      │  (same pattern as     │
│  └──────────────────────────────┘   notification-svc)   │
└────────────────────┬────────────────────────────────────┘
                     │ AMQP consumer
                     ▼
                 RabbitMQ
                 exchange: ride-events (topic)
                     ▲
                     │ publishes ride.*
              ride-service
```

### 3.2 Data Flow

**Driver location (ephemeral, high-frequency):**

```
Driver socket
  → emit('driver:location:update', { rideId, lat, lng, heading, speed })
  → RidesGateway.handleLocationUpdate()
  → socket.to('ride:<rideId>').emit('ride:driver:location', data)
  → Rider socket (in same room)
```

GPS frames bypass RabbitMQ — they are ephemeral and high-frequency. Persisting them would be wasteful; the latest frame is all that matters.

**Ride status changes (durable, low-frequency):**

```
HTTP call (PATCH /api/rides/:id/match)
  → ride-service RidesService.matchRide()
  → EventPublisherService.publish('ride.matched', payload)
  → RabbitMQ exchange: ride-events, routing key: ride.matched
  → queue: websocket.rides (RidesEventConsumerService in api-gateway)
  → RidesGateway.broadcastRideStatus(rideId, eventType, payload)
  → server.to('ride:<rideId>').emit('ride:status:changed', { eventType, payload })
  → All sockets in the room (rider + driver)
```

### 3.3 Design Decisions

| Decision                     | Choice                                       | Rationale                                                                                                                   |
| ---------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Where does the gateway live? | `api-gateway`                                | It is already the single client entry point; avoids a new service and port                                                  |
| Driver location routing      | Direct socket relay (no RabbitMQ)            | GPS frames are ephemeral; persisting them in a broker adds latency + overhead with no benefit                               |
| Status changes routing       | Via RabbitMQ consumer                        | ride-service already publishes these events; the gateway subscribes like any other consumer — no coupling                   |
| Room scoping                 | `ride:<rideId>`                              | Ensures a rider can only receive updates for their own ride; driver joins the same room                                     |
| Auth strategy                | JWT on WS handshake via gRPC `ValidateToken` | Reuses the exact same validation chain as the HTTP JWT strategy; unauthenticated sockets are rejected before any data flows |
| Scaling caveat               | In-memory rooms (single instance)            | Acceptable for development; production would add a Redis adapter (one import)                                               |

---

## 4. Prerequisites & Dependencies

### 4.1 Code dependencies

- **Week 4 complete** — the gRPC `ValidateToken` RPC (used to auth WS handshakes) must be running in user-service.
- **RabbitMQ running** — ride-service publishes events; the gateway consumes them.

### 4.2 Package installation

```bash
# From the project root
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io --legacy-peer-deps
```

| Package                      | Version | Purpose                            |
| ---------------------------- | ------- | ---------------------------------- |
| `@nestjs/websockets`         | latest  | NestJS WebSocket decorator support |
| `@nestjs/platform-socket.io` | latest  | Socket.io adapter for NestJS       |
| `socket.io`                  | latest  | WebSocket server library           |

### 4.3 Environment variables

No new variables required. The gateway reuses:

| Variable                | Default                             | Used for                                                             |
| ----------------------- | ----------------------------------- | -------------------------------------------------------------------- |
| `RABBITMQ_URL`          | `amqp://guest:guest@localhost:5672` | WebSocket event consumer queue connection                            |
| `USER_SERVICE_GRPC_URL` | `localhost:50051`                   | gRPC token validation at WS handshake                                |
| `JWT_SECRET`            | —                                   | Fallback if gRPC is unavailable (not used in current implementation) |

---

## 5. Implementation Guide

### Step 5.1 — Stand up the WebSocket gateway

**Goal:** Clients can connect over WebSocket and the server logs connect/disconnect.

**New file:** `apps/api-gateway/src/rides/rides.gateway.ts`

```typescript
@WebSocketGateway({ cors: { origin: '*' } })
export class RidesGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer() server: Server;

  // handleConnection — validates JWT, stores user on socket.data
  // handleDisconnect — logs disconnect with userId
}
```

**New file:** `apps/api-gateway/src/rides/rides.module.ts`  
Wires `RidesGateway`, `RidesEventConsumerService`, and re-registers the `USER_SERVICE` gRPC client.

**Modified:** `apps/api-gateway/src/app.module.ts` — import `RidesModule`  
**Modified:** `apps/api-gateway/src/main.ts` — add `app.enableCors()` (required for Socket.io HTTP upgrade)

**✅ Acceptance criteria:**

- Connect with a Socket.io client (no token) → connection is rejected/disconnected immediately
- Connect with a valid JWT token → connection is accepted; server logs `Client connected: <id> (userId=...)`
- Disconnect → server logs `Client disconnected: <id>`

```bash
# Quick test (Node.js)
node -e "
const io = require('socket.io-client');
const s = io('http://localhost:3000', { auth: { token: '<your-jwt>' } });
s.on('connect', () => console.log('connected:', s.id));
s.on('disconnect', () => console.log('disconnected'));
setTimeout(() => s.disconnect(), 2000);
"
```

---

### Step 5.2 — Rooms: rider joins a ride, driver sends location

**Goal:** Scope messages to one ride via room `ride:<rideId>`.

**Events handled in `RidesGateway`:**

| Event (in)               | Emitter         | Action                                                  |
| ------------------------ | --------------- | ------------------------------------------------------- |
| `ride:join`              | rider or driver | `client.join('ride:<rideId>')`                          |
| `driver:location:update` | driver          | relay to `ride:<rideId>` room as `ride:driver:location` |

**Payload shapes:**

```typescript
// ride:join
{ rideId: string }

// driver:location:update
{ rideId: string; lat: number; lng: number; heading?: number; speed?: number }

// ride:driver:location  (emitted to room)
{ rideId: string; lat: number; lng: number; heading?: number; speed?: number }
```

**✅ Acceptance criteria:**

- Open two clients, both join `ride:abc`; driver emits `driver:location:update { rideId: 'abc', lat: 1.0, lng: 1.0 }` → only the rider client (in the same room) receives `ride:driver:location`
- A third client connected to a different room (`ride:xyz`) receives nothing

```bash
# Two-client test in Node.js
node -e "
const io = require('socket.io-client');
// Rider
const rider = io('http://localhost:3000', { auth: { token: '<rider-jwt>' } });
rider.on('connect', () => {
  rider.emit('ride:join', { rideId: 'test-123' });
  rider.on('ride:driver:location', (data) => console.log('Rider got location:', data));
});
// Driver
const driver = io('http://localhost:3000', { auth: { token: '<driver-jwt>' } });
driver.on('connect', () => {
  driver.emit('ride:join', { rideId: 'test-123' });
  setTimeout(() => driver.emit('driver:location:update', { rideId: 'test-123', lat: 12.97, lng: 77.59 }), 500);
});
"
```

---

### Step 5.3 — Push ride-status changes to the room

**Goal:** Every ride state-machine transition pushes `ride:status:changed` to all sockets in the ride's room.

**Two parts:**

**Part A — Fix missing `ride.in_progress` event in ride-service**

`apps/ride-service/src/rides/rides.service.ts` — `startRide()` was not publishing an event. Add:

```typescript
await this.publisher.publish(
  'ride.in_progress',
  { rideId: saved.id, riderId: saved.riderId, driverId: saved.driverId },
  ride.correlationId,
);
```

Now all 5 transitions publish events: `ride.requested`, `ride.matched`, `ride.in_progress`, `ride.completed`, `ride.cancelled`.

**Part B — RabbitMQ consumer in api-gateway**

**New file:** `apps/api-gateway/src/rides/rides-event-consumer.service.ts`

Uses the exact same `amqplib` pattern as `notification-service/event-consumer.service.ts`:

- Queue: `websocket.rides` (new, dedicated queue)
- Bindings: all 5 `ride.*` routing keys
- On message: calls `ridesGateway.broadcastRideStatus(rideId, eventType, payload)`

`broadcastRideStatus` in the gateway:

```typescript
broadcastRideStatus(rideId: string, eventType: string, payload: unknown) {
  this.server.to(`ride:${rideId}`).emit('ride:status:changed', { eventType, payload });
}
```

**Event emitted to clients:**

```typescript
// ride:status:changed
{
  eventType: 'ride.requested' | 'ride.matched' | 'ride.in_progress' | 'ride.completed' | 'ride.cancelled',
  payload: { rideId, riderId, driverId?, ... }  // varies per event type
}
```

**✅ Acceptance criteria:**

- Join a room for a ride, then drive the ride through the full lifecycle via HTTP:
  - `POST /api/rides` → receive `ride:status:changed { eventType: 'ride.requested' }`
  - `PATCH /api/rides/:id/match` → receive `ride:status:changed { eventType: 'ride.matched' }`
  - `PATCH /api/rides/:id/start` → receive `ride:status:changed { eventType: 'ride.in_progress' }`
  - `PATCH /api/rides/:id/complete` → receive `ride:status:changed { eventType: 'ride.completed' }`

---

### Step 5.4 — Lifecycle & cleanup

**Goal:** Handle disconnects/reconnects without stale state.

**What's already handled automatically by Socket.io:**

- When a socket disconnects, it is removed from all rooms it joined — no manual cleanup needed.

**What we add:**

1. **JWT auth at handshake** (wired in Step 5.1 but conceptually belongs here):
   - Read `socket.handshake.auth.token`
   - Call gRPC `ValidateToken` — same RPC as `jwt.strategy.ts`
   - If invalid/missing → `client.disconnect()` (before any events can be sent/received)
   - If valid → store on `client.data.user = { userId, email, role }`

2. **Reconnect behaviour:**
   - On reconnect, the client must re-emit `ride:join` to re-enter the room (Socket.io room membership is not persisted across disconnects)
   - This is by design — it ensures stale connections can never broadcast to the wrong room

**✅ Acceptance criteria:**

- Connect without a token → disconnected immediately, no events processed
- Connect with an expired/invalid token → disconnected immediately
- Connect with a valid token → all events work
- Disconnect mid-ride → no errors in server logs; no stale broadcasts to the disconnected socket
- Reconnect + re-emit `ride:join` → updates resume normally

---

## 6. File Reference

### New files

```
apps/api-gateway/src/rides/
├── rides.gateway.ts              # @WebSocketGateway — main socket handler
├── rides-event-consumer.service.ts  # amqplib consumer → broadcasts to rooms
└── rides.module.ts               # Module wiring the above + gRPC client
```

### Modified files

| File                                           | Change                                          |
| ---------------------------------------------- | ----------------------------------------------- |
| `apps/api-gateway/src/app.module.ts`           | Add `RidesModule` to imports                    |
| `apps/api-gateway/src/main.ts`                 | Add `app.enableCors()` before listen            |
| `apps/ride-service/src/rides/rides.service.ts` | Add `ride.in_progress` publish in `startRide()` |

---

## 7. Development Guidelines & Best Practices

### Socket event naming convention

Use the `namespace:action` pattern consistently:

- **In** (emitted by clients): `ride:join`, `driver:location:update`
- **Out** (emitted by server): `ride:driver:location`, `ride:status:changed`

### Room naming convention

Always `ride:<rideId>` where `rideId` is the UUID from the database. Never use user IDs as room names — a driver and rider must share the same room to exchange messages.

### Don't trust the client

The socket auth step validates the token but does not enforce that a driver can only send location updates for rides they are assigned to. For production, add a check in `handleLocationUpdate`: verify `client.data.user.userId === ride.driverId` before relaying.

### Prefetch = 1

The RabbitMQ consumer uses `channel.prefetch(1)` — process one message at a time. This is intentional: WS broadcasts are fast (in-memory), so head-of-line blocking is not a concern, and it keeps the error isolation simple.

### No idempotency for WS broadcasts

Unlike notification-service, the WebSocket consumer does **not** track processed eventIds. Rationale: a duplicate `ride:status:changed` pushed to a connected client is harmless (the client renders the same state again). Tracking idempotency would require a database table and adds complexity with no meaningful benefit here.

### CORS

`app.enableCors()` in `main.ts` uses the default permissive config (`origin: '*'`). For production, scope it to your frontend's origin.

---

## 8. Acceptance Criteria Summary

| Step | Criterion                                                   | How to test                                                     |
| ---- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| 5.1  | Server logs connect/disconnect                              | Connect/disconnect a Socket.io client                           |
| 5.1  | Bad token is rejected at handshake                          | Connect without `auth.token` → socket disconnects               |
| 5.2  | Rider receives driver's location only when in the same room | Two-client test; driver emits location; verify isolation        |
| 5.2  | Client in a different room gets nothing                     | Third client on `ride:xyz` while driver updates `ride:abc`      |
| 5.3  | All 5 state transitions push `ride:status:changed`          | Drive ride through full lifecycle via HTTP                      |
| 5.3  | `ride.in_progress` is now published by ride-service         | Check RabbitMQ management UI at `:15672` after calling `/start` |
| 5.4  | Disconnect mid-ride → no errors, no stale state             | Disconnect a client then complete the ride via HTTP             |
| 5.4  | Reconnect + re-join → updates resume                        | Disconnect, reconnect, re-emit `ride:join`, continue ride       |

---

## 9. End-to-End Testing Script

```bash
# 1. Start all services
npm run start:dev:all

# 2. Register a rider
curl -s -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"fullName":"Test Rider","email":"rider@test.com","password":"pass123","role":"RIDER"}' | jq .

# 3. Login as rider — save the token
RIDER_TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"rider@test.com","password":"pass123"}' | jq -r '.accessToken')

# 4. Connect a Socket.io client and join the ride room (Node.js script)
cat > /tmp/ws-test.mjs << 'EOF'
import { io } from 'socket.io-client';

const token = process.env.TOKEN;
const rideId = process.env.RIDE_ID;

const socket = io('http://localhost:3000', { auth: { token } });

socket.on('connect', () => {
  console.log('Connected:', socket.id);
  socket.emit('ride:join', { rideId });
});

socket.on('ride:status:changed', (data) => {
  console.log('Status changed:', JSON.stringify(data, null, 2));
});

socket.on('ride:driver:location', (data) => {
  console.log('Driver location:', data);
});

socket.on('disconnect', () => console.log('Disconnected'));
EOF

# 5. Request a ride
RIDE_ID=$(curl -s -X POST http://localhost:3000/api/rides \
  -H "Authorization: Bearer $RIDER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"pickupAddress":"MG Road","pickupLat":12.97,"pickupLng":77.59,"dropoffAddress":"Indiranagar","dropoffLat":12.98,"dropoffLng":77.64}' | jq -r '.id')

# 6. Run the WebSocket client
TOKEN=$RIDER_TOKEN RIDE_ID=$RIDE_ID node /tmp/ws-test.mjs &

# 7. Drive the ride through state transitions (as driver/admin)
curl -s -X PATCH http://localhost:3000/api/rides/$RIDE_ID/match \
  -H "Authorization: Bearer $DRIVER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"driverId":"<driver-uuid>","estimatedArrivalMinutes":3}'

curl -s -X PATCH http://localhost:3000/api/rides/$RIDE_ID/start \
  -H "Authorization: Bearer $DRIVER_TOKEN"

curl -s -X PATCH http://localhost:3000/api/rides/$RIDE_ID/complete \
  -H "Authorization: Bearer $DRIVER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"fareAmount":250}'

# Expected: WebSocket client logs ride:status:changed for matched, in_progress, completed
```

---

## 10. Assumptions, Risks & Improvements

### Assumptions

- One `api-gateway` instance runs at a time in development — Socket.io rooms are in-memory.
- Clients handle `ride:status:changed` idempotently (re-rendering the same state is safe).
- The `ride:join` event is re-emitted by the client after reconnect (standard Socket.io client-side behaviour).

### Risks

| Risk                           | Impact                                                                                                  | Mitigation                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Horizontal scaling**         | If multiple gateway replicas run, a message broadcast from instance A won't reach clients on instance B | Add `socket.io-redis` adapter (one import); deferred to production |
| **Driver spoofing**            | A client can emit `driver:location:update` for any `rideId` without ownership check                     | Add role + ride ownership validation in `handleLocationUpdate`     |
| **WS consumer restart**        | If gateway restarts, the `websocket.rides` queue persists messages; they will be delivered on reconnect | Queue is durable (`{ durable: true }`), so no events are lost      |
| **gRPC downtime at handshake** | If user-service is down, all new WS connections fail                                                    | Acceptable in dev; could add a JWT-only fallback for production    |

### Future improvements

1. **Redis adapter** — `@socket.io/redis-adapter` for horizontal scaling.
2. **Driver ownership check** — validate that the emitting socket's `userId` matches `ride.driverId` before relaying location.
3. **Location history** — optionally persist the last known driver location to Redis so riders who join late (or reconnect) get an immediate position instead of waiting for the next GPS frame.
4. **Typed client events** — generate TypeScript types for socket events and share them via `@ridewave/events` lib so client apps get autocompletion.
5. **Rate limiting** — add a per-socket rate limit on `driver:location:update` (e.g., max 1 update/second) to prevent flooding.

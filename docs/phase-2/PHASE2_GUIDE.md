# RideWave — Phase 2 Guide

> **Phase 2 = Weeks 4–6: "High-performance communication & distributed transactions."**
> Phase 1 proved the 5 services exist and can talk via REST + RabbitMQ events. Phase 2 makes them **smart** (auto driver verification), **real-time** (live driver location), and **resilient** (rollback on failure). This guide explains *what* you're building and *why*. The companion file [PHASE2_DEVELOPMENT_STEPS.md](PHASE2_DEVELOPMENT_STEPS.md) is the *how* — the chunked build order.

---

## The one-paragraph picture

In Phase 1 you manually picked a driver, typed the fare, and nothing rolled back on failure. Phase 2 replaces those manual steps with real mechanisms:
- **gRPC** for fast, typed, synchronous internal calls (the gateway validates tokens against User Service; Ride Service verifies a driver exists before matching).
- **WebSockets (Socket.io)** for real-time driver location and live ride-status updates pushed to the rider's screen.
- **The Saga pattern + Dead Letter Queue** so a multi-service booking can roll back cleanly (cancel → release payment) and no failed message is ever silently lost.

---

## The three communication models (the core mental model)

Phase 2 is really about learning **when to use which** of three tools. None replaces the others:

| Model | Use when | RideWave example | Added in |
|---|---|---|---|
| **REST (HTTP)** | External client ↔ edge | Client → API Gateway | Phase 1 (stays) |
| **gRPC** | Internal, high-frequency, "I need an answer **now**" | Gateway → User Service `ValidateToken`; Ride → User `GetDriver` | **Phase 2 (Week 4)** |
| **Events (RabbitMQ)** | Internal, "react to a fact, **don't block me**" | `ride.completed` → charge + notify | Phase 1 (extended in Week 6) |

> Rule of thumb: **REST at the edge, gRPC for synchronous internal calls, events for asynchronous reactions.** Phase 2 adds the gRPC column and hardens the events column.

### Where this changes your current code
| Call | Phase 1 (now) | Phase 2 target |
|---|---|---|
| Gateway → User Service for auth | Local JWT verify (no call) | **gRPC `ValidateToken`** |
| Ride → User Service to verify driver | Not done (you pass an ID by hand) | **gRPC `GetDriver`** |
| Rider sees driver location | Nothing | **WebSocket push** |
| Cancel mid-trip | Publishes `ride.cancelled`, payment does nothing | **Saga compensation**: payment releases pre-auth |
| Failed event | `nack(false)` → dropped | **Dead Letter Queue** → parked for inspection/retry |

---

## Week-by-week scope

### Week 4 — gRPC Integration
**Goal:** Replace synchronous internal HTTP/local checks with a typed gRPC contract.
- Define `user.proto`: `ValidateToken`, `GetUser`, `GetDriver`.
- gRPC **server** in User Service (implements those RPCs).
- gRPC **client** in API Gateway — token validation becomes a real remote call.
- Ride Service calls User Service via gRPC to **verify the driver exists** before `/match`.
- Benchmark HTTP-JSON vs gRPC for the validation path.

**Learn:** Protocol Buffers, the `.proto` contract, NestJS gRPC transport (`@nestjs/microservices` + `@grpc/grpc-js`), why HTTP/2 + binary serialization matters on a per-request hot path.

### Week 5 — Real-Time with WebSockets (Socket.io)
**Goal:** Live, bidirectional updates between driver, server, and rider.
- Socket.io gateway in the API Gateway.
- Driver client emits `driver:location:update` (~every 3s).
- Server broadcasts `ride:driver:location` to the rider's **room** (`ride:<rideId>`).
- Handle connection / disconnection lifecycle.
- Push `ride:status:changed` to both rider and driver when the state machine transitions.

**Learn:** Socket.io rooms & namespaces, connection state, broadcast vs unicast, how ride-service state changes reach a socket (events → gateway → socket room).

### Week 6 — Saga Pattern & Distributed Transactions
**Goal:** A booking spans Ride + Payment; make it consistent without a distributed lock.
- Ride Service as the **saga orchestrator**.
- Payment Service **pre-authorizes** on ride request/match (`payment.preauth.success/failed`).
- **Compensating transaction:** `ride.cancelled` → Payment **releases** the pre-auth.
- Deliberately fail Payment Service to exercise the failure path.
- Add a **Dead Letter Queue (DLX)** so failed payment/notification messages are parked, not dropped.
- Add the missing **idempotency check in Payment Service** (Phase 1 only had it in Notification).

**Learn:** Saga orchestration vs choreography, compensating transactions, eventual consistency, RabbitMQ Dead Letter Exchanges, idempotent consumers.

---

## Target architecture after Phase 2

```
                 Client (web/mobile)
              REST │           │ WebSocket
                   ▼           ▼
            ┌──────────────────────────┐
            │       API Gateway        │
            │  - JWT guard             │
            │  - Socket.io gateway     │
            └──────────────────────────┘
              │ gRPC          │ REST proxy
   ValidateToken│             │ (forward POST /rides etc.)
              ▼               ▼
      ┌──────────────┐   ┌──────────────┐
      │ User Service │◄──│ Ride Service │   Ride → User: gRPC GetDriver
      │  gRPC server │gRPC│ saga orch.  │
      └──────────────┘   └──────────────┘
                                │ publishes events
                                ▼
                    ┌────────────────────────┐
                    │  RabbitMQ: ride-events  │
                    │  + dlx.exchange (DLQ)   │
                    └────────────────────────┘
                        │                 │
              payment.rides        notification.rides
                        ▼                 ▼
              Payment Service      Notification Service
              (pre-auth/charge/    (idempotent notifies)
               release + idempotency)
```

---

## New dependencies you'll add (per week)

| Week | Packages (NestJS 10 compatible) |
|---|---|
| 4 (gRPC) | `@nestjs/microservices`, `@grpc/grpc-js`, `@grpc/proto-loader` (`@nestjs/microservices` is already installed) |
| 5 (WebSockets) | `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io` |
| 6 (Saga/DLQ) | none new — uses existing `amqplib` (add DLX config) |

A new shared lib **`libs/proto`** will hold the `.proto` files and generated types (the plan's repo structure already reserves it).

---

## How we'll work it (same rhythm as Phase 1)
1. One **step** at a time (see the chunked file), not a whole week at once.
2. Each step ends with a **"prove it works"** check before moving on.
3. Concept explained → implement → you test → questions → next step.

> ⚠️ **Do Week 4 before Week 6** — the Saga's driver verification depends on the gRPC `GetDriver` built in Week 4. Week 5 (WebSockets) is largely independent and can be deferred without blocking Week 6.

Start here → [PHASE2_DEVELOPMENT_STEPS.md](PHASE2_DEVELOPMENT_STEPS.md).

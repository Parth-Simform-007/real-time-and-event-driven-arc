# RideWave — Phase 1: Foundation

NestJS microservices ride-hailing platform. Phase 1 implements the event-driven foundation across 5 isolated services.

---

## Services

| Service              | Port | Database              | Purpose                                      |
|----------------------|------|-----------------------|----------------------------------------------|
| api-gateway          | 3000 | None                  | JWT validation, HTTP proxy to all services   |
| user-service         | 3001 | ridewave_users        | Registration, login, JWT issuance            |
| ride-service         | 3002 | ridewave_rides        | Ride lifecycle state machine, event publisher|
| payment-service      | 3003 | ridewave_payments     | Subscribes to ride events (Phase 1: scaffold)|
| notification-service | 3004 | ridewave_notifications| Consumes ride events with idempotency check  |

---

## Quick Start

```bash
cd infrastructure
docker-compose up --build
```

All 5 PostgreSQL databases, RabbitMQ, and all services start.

- RabbitMQ Management UI: http://localhost:15672 (guest/guest)
- API Gateway: http://localhost:3000

---

## API Endpoints

### Auth (public — via API Gateway)

```bash
# Register a rider
POST /api/auth/register
{
  "email": "rider@example.com",
  "password": "password123",
  "fullName": "Alice Smith",
  "phone": "+1234567890",
  "role": "RIDER"
}

# Login
POST /api/auth/login
{ "email": "rider@example.com", "password": "password123" }
# Returns: { user, accessToken, refreshToken }

# Refresh token
POST /api/auth/refresh
{ "refreshToken": "<token>" }
```

### Rides (protected — requires Authorization: Bearer <accessToken>)

```bash
# Request a ride
POST /api/rides
Authorization: Bearer <token>
{
  "pickupAddress": "123 Main St",
  "pickupLat": 37.7749,
  "pickupLng": -122.4194,
  "dropoffAddress": "456 Market St",
  "dropoffLat": 37.7849,
  "dropoffLng": -122.4094
}

# Match a driver to a ride
PATCH /api/rides/:id/match
{ "driverId": "<driver-uuid>", "estimatedArrivalMinutes": 3 }

# Start the ride
PATCH /api/rides/:id/start

# Complete the ride
PATCH /api/rides/:id/complete
{ "fareAmount": 18.50 }

# Cancel the ride
PATCH /api/rides/:id/cancel
{ "cancelledBy": "rider", "reason": "Changed plans" }

# Get ride details
GET /api/rides/:id

# Get rider history
GET /api/rides/history
```

### Health Checks

```bash
GET /api/health  # on each service port
```

---

## Event Flow

```
Client → API Gateway (JWT guard)
           │
           ├─→ POST /api/rides → Ride Service
           │         │
           │         └─→ RabbitMQ [ride-events exchange, topic]
           │                   │
           │                   ├─→ notification.rides queue → Notification Service
           │                   │       (idempotency check via processed_events table)
           │                   │
           │                   └─→ payment.rides queue → Payment Service
```

### Event Envelope (every message)

```json
{
  "eventId": "uuid-v4",          // idempotency key
  "eventType": "ride.requested",
  "version": "1.0",
  "timestamp": "ISO-8601",
  "sourceService": "ride-service",
  "correlationId": "uuid-v4",    // ties all events for one booking
  "payload": { ... }
}
```

---

## Test the Full Flow with curl

```bash
# 1. Register and get a token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@test.com","password":"password123","fullName":"Alice","phone":"555-0001"}' \
  | jq -r '.accessToken')

echo "Token: $TOKEN"

# 2. Request a ride
RIDE_ID=$(curl -s -X POST http://localhost:3000/api/rides \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pickupAddress":"123 Main St","pickupLat":37.7749,"pickupLng":-122.4194,
    "dropoffAddress":"456 Market St","dropoffLat":37.7849,"dropoffLng":-122.4094
  }' | jq -r '.id')

echo "Ride ID: $RIDE_ID"
# Notification Service logs should show: [NOTIFY] Ride requested ...

# 3. Match a driver
curl -s -X PATCH http://localhost:3002/api/rides/$RIDE_ID/match \
  -H "Content-Type: application/json" \
  -d '{"driverId":"driver-uuid-123","estimatedArrivalMinutes":4}'

# 4. Start the ride
curl -s -X PATCH http://localhost:3002/api/rides/$RIDE_ID/start

# 5. Complete the ride
curl -s -X PATCH http://localhost:3002/api/rides/$RIDE_ID/complete \
  -H "Content-Type: application/json" \
  -d '{"fareAmount":18.50}'
```

---

## Idempotency Test

To verify the Notification Service deduplicates events:

```bash
# Publish the same ride.requested event twice to RabbitMQ
# The second time, Notification Service logs:
# [IDEMPOTENCY] Skipping duplicate eventId=<id> type=ride.requested
```

---

## Phase 1 Exit Criteria

- [ ] All 5 services start via `docker-compose up`
- [ ] Rider can register, login, and receive a JWT
- [ ] Ride request flows: API Gateway → Ride Service → RabbitMQ → Notification Service
- [ ] Notification Service deduplicates the same `eventId`
- [ ] Each service has its own isolated PostgreSQL database
- [ ] Health check endpoints respond on every service

---

## DB Isolation Rule

> Service A must **never** directly query Service B's database.
> All cross-service communication happens through events (RabbitMQ) or HTTP calls via the API Gateway.

---

*Phase 2 will add: gRPC (User Service ↔ API Gateway), WebSockets (driver location), Saga pattern (booking rollback), and Dead Letter Queue.*

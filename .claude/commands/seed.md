Seed the RideWave database with a test rider, driver, and a matched ride so there is clean data to work with.

All calls go through the API gateway at http://localhost:3000. Use the Bash tool with curl for each step in sequence.

## Step 1 — Register rider

```bash
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Seed Rider","email":"seed.rider@ridewave.dev","password":"Seed@1234","role":"RIDER"}'
```

Extract `data.id` → this is RIDER_ID.

## Step 2 — Register driver

```bash
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Seed Driver","email":"seed.driver@ridewave.dev","password":"Seed@1234","role":"DRIVER"}'
```

Extract `data.id` → this is DRIVER_ID.

## Step 3 — Login as rider → get RIDER_TOKEN

```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"seed.rider@ridewave.dev","password":"Seed@1234"}'
```

Extract `data.accessToken` → RIDER_TOKEN.

## Step 4 — Request a ride (as rider)

```bash
curl -s -X POST http://localhost:3000/api/rides \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RIDER_TOKEN" \
  -d '{
    "pickupAddress": "MG Road, Bengaluru",
    "pickupLat": 12.9758, "pickupLng": 77.6012,
    "dropoffAddress": "Indiranagar, Bengaluru",
    "dropoffLat": 12.9784, "dropoffLng": 77.6408
  }'
```

Extract `data.id` → RIDE_ID.

## Step 5 — Match the ride (assign driver)

```bash
curl -s -X PATCH http://localhost:3000/api/rides/$RIDE_ID/match \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RIDER_TOKEN" \
  -d "{\"driverId\": \"$DRIVER_ID\", \"estimatedArrivalMinutes\": 3}"
```

## After all steps, print a summary:

```
Seed complete ✅
  Rider ID    : <RIDER_ID>
  Driver ID   : <DRIVER_ID>
  Ride ID     : <RIDE_ID>  (status: MATCHED)
  Rider token : <RIDER_TOKEN>  (use this in Postman as accessToken)
```

If registration fails with a conflict (email already exists), skip that step and proceed to login to retrieve the existing token. Report which steps were skipped.

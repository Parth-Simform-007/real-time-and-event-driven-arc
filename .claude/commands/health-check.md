Check the health of all 5 RideWave services by hitting their `/api/health` endpoints and report a status table.

Use the Bash tool to run the following curl commands (3-second timeout each). Each service uses `@nestjs/terminus` and returns `{ "status": "ok" }` when healthy.

Services to check:

- API Gateway → http://localhost:3000/api/health
- User Service → http://localhost:3001/api/health
- Ride Service → http://localhost:3002/api/health
- Payment Service → http://localhost:3003/api/health
- Notification Svc → http://localhost:3004/api/health

Run all 5 checks in a single bash command using this pattern:

```bash
for svc in "API Gateway|3000" "User Service|3001" "Ride Service|3002" "Payment Service|3003" "Notification Service|3004"; do
  name=$(echo $svc | cut -d'|' -f1)
  port=$(echo $svc | cut -d'|' -f2)
  code=$(curl -s -o /tmp/hw_$port.json -w "%{http_code}" --connect-timeout 3 http://localhost:$port/api/health 2>/dev/null)
  body=$(cat /tmp/hw_$port.json 2>/dev/null)
  echo "$name|$port|$code|$body"
done
```

Then report a clean table:
| Service | Port | Status | DB |
|---|---|---|---|

- ✅ UP when HTTP 200 and `status: "ok"` in body
- ❌ DOWN for connection refused or non-200
- DB column: show `ok` or `down` from the terminus database ping result

If any service is DOWN, suggest the likely cause (not started, wrong port, DB connection failed).

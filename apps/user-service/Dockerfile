FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx nest build user-service

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist/apps/user-service ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3001
CMD ["node", "dist/main"]

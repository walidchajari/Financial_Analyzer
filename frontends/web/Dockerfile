FROM node:20-bullseye-slim AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV BACKEND_API_BASE=${BACKEND_API_BASE:-http://backend:8000}

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

FROM node:20-bullseye-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV BACKEND_API_BASE=${BACKEND_API_BASE:-http://backend:8000}
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json

RUN npm ci --omit=dev --ignore-scripts

EXPOSE 3000

CMD ["npm", "run", "start"]

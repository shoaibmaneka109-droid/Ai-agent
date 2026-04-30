FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies only (cached layer)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy source
COPY src ./src

EXPOSE 3001

CMD ["node", "src/server.js"]

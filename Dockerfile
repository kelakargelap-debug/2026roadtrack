# Dockerfile for Frontend (Node.js/React/Express)
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source and build the application
COPY . .
RUN npm run build

# Development stage for local docker-compose
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --production

# In a real production setup, we might only copy the dist folder 
# and use a smaller image, but for this full-stack setup (Express+Vite)
# we need the source for the Express server to serve the build.
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/package.json ./

# Install tsx globally or use node with type stripping (Node 22+)
RUN npm install -g tsx

EXPOSE 3000

ENV NODE_ENV=production

# Command to run the express server which serves the static files and might proxy to Python backend
CMD ["tsx", "server.ts"]

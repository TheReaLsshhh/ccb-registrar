# =============================================================================
# Registrar Frontend - Multi-stage build
# Stage 1: Build React app | Stage 2: Serve with Nginx
# =============================================================================

# --- Stage 1: Build ---
FROM node:20-alpine AS build

WORKDIR /app

# Install all dependencies (including devDependencies for Vite/TypeScript build)
COPY package*.json ./
RUN npm ci

# Build the application
COPY . .
RUN npm run build

# --- Stage 2: Production ---
FROM nginx:1.27-alpine

# Copy built app from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx config (SPA routing, /api proxy to backend)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

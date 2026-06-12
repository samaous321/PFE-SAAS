# ============================================================================
# STAGE 1: Build Angular Application
# ============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with frozen lockfile
RUN npm ci

# Copy source code
COPY . .

# Build production-ready Angular application
RUN npm run build -- --configuration production

# ============================================================================
# STAGE 2: Nginx Production Server
# ============================================================================
FROM nginx:1.25-alpine

# Security: Set metadata labels
LABEL maintainer="ousssama"
LABEL version="1.0.0"
LABEL description="PFE Secure Storage Frontend Service"

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built Angular app from builder stage
COPY --from=builder /app/dist/pfe-frontend /usr/share/nginx/html

# Create nginx cache directories with proper permissions
RUN mkdir -p /var/cache/nginx && \
    chmod -R 755 /var/cache/nginx && \
    chown -R nginx:nginx /var/cache/nginx

# Security: Create non-root user (already exists in nginx image)
# nginx user already exists in official nginx image

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/health || exit 1

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
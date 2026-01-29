FROM nginx:alpine
COPY dist/ /usr/share/nginx/html
# basic SPA routing
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# Accept build-time variables for Vite (must be prefixed with VITE_)
ARG VITE_API_BASE_URL
ARG VITE_API_KEY

# Expose them to the Vite build
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_API_KEY=${VITE_API_KEY}

# Install deps first for better caching
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ---- Runtime stage ----
FROM nginx:alpine

# Copy built assets
COPY --from=build /app/dist/ /usr/share/nginx/html

# basic SPA routing
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
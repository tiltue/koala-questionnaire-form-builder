# Multi-stage build for React Frontend
# Stage 1: Build the React application
# Stage 2: Serve with Nginx and run Functions Server

### Stage 1: Build ###
FROM node:18-alpine AS build

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production=false

# Copy source code
COPY . .

# Build arguments for environment variables
# These will be available during build time
ARG REACT_APP_QUESTIONNAIRE_API_URL
ARG REACT_APP_XAUTH_API_URL
ARG REACT_APP_URL=""

# Set environment variables for the build process
# REACT_APP_URL is optional - can be set later if needed
ENV REACT_APP_QUESTIONNAIRE_API_URL=${REACT_APP_QUESTIONNAIRE_API_URL}
ENV REACT_APP_XAUTH_API_URL=${REACT_APP_XAUTH_API_URL}
ENV REACT_APP_URL=${REACT_APP_URL}

# Set NODE_OPTIONS for compatibility with older webpack/react-scripts
# This fixes the OpenSSL error with Node.js 18 and increases heap size to prevent out of memory errors
ENV NODE_OPTIONS="--openssl-legacy-provider --max-old-space-size=4096"

# Build the application
RUN npm run build

### Stage 2: Serve with Nginx and Functions Server ###
FROM node:18-alpine

# Install nginx
RUN apk add --no-cache nginx

# Set working directory
WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy built React app from build stage
COPY --from=build /app/build /usr/share/nginx/html

# Copy functions and server files
COPY functions ./functions
COPY server ./server

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy startup script
COPY docker/start.sh /start.sh
RUN chmod +x /start.sh

# Create nginx log directory
RUN mkdir -p /var/log/nginx /var/run/nginx

# Environment variables for runtime
# Use ARG to pass from build stage, with defaults
ARG REACT_APP_QUESTIONNAIRE_API_URL=""
ARG REACT_APP_XAUTH_API_URL=""
ARG REACT_APP_URL=""

ENV NODE_ENV=production
ENV FUNCTIONS_PORT=9000
ENV QUESTIONNAIRE_API_URL=${REACT_APP_QUESTIONNAIRE_API_URL}
ENV XAUTH_API_URL=${REACT_APP_XAUTH_API_URL}
ENV REACT_APP_URL=${REACT_APP_URL}

# Expose ports
EXPOSE 80 9000

# Start both nginx and functions server
CMD ["/start.sh"]

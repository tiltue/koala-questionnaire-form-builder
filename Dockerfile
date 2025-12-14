# Multi-stage build for React Frontend
# Stage 1: Build the React application
# Stage 2: Serve with Nginx

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

### Stage 2: Serve with Nginx ###
FROM nginx:alpine

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built files from build stage
COPY --from=build /app/build /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

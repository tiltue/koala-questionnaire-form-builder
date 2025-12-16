#!/bin/sh
set -e

echo "Starting services..."

# Start functions server in background
echo "Starting functions server on port ${FUNCTIONS_PORT:-9000}..."
node /app/server/functions-server.js &
FUNCTIONS_PID=$!

# Wait a moment for functions server to start
sleep 2

# Check if functions server is still running
if ! kill -0 $FUNCTIONS_PID 2>/dev/null; then
    echo "ERROR: Functions server failed to start!"
    exit 1
fi

echo "Functions server started (PID: $FUNCTIONS_PID)"
echo "Starting nginx..."

# Function to handle shutdown
cleanup() {
    echo "Shutting down services..."
    kill $FUNCTIONS_PID 2>/dev/null || true
    killall nginx 2>/dev/null || true
    exit 0
}

# Trap signals for graceful shutdown
trap cleanup SIGTERM SIGINT

# Start nginx in foreground (this becomes the main process)
nginx -g "daemon off;"


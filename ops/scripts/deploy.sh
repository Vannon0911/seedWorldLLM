#!/bin/bash

# SeedWorld Deployment Script
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/ops/docker/docker-compose.yml"
COMPOSE="docker compose -f ${COMPOSE_FILE}"

echo "🚀 Deploying SeedWorld Application..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Build and start the application
echo "📦 Building Docker image..."
${COMPOSE} build

echo "🔄 Starting application..."
${COMPOSE} up -d

echo "⏳ Waiting for application to be healthy..."
sleep 10

# Check if application is running
if ${COMPOSE} ps | grep -q "Up"; then
    echo "✅ Application deployed successfully!"
    echo "🌐 Application is available at: http://localhost:3000"
    echo "🔧 WebSocket endpoint: ws://localhost:8080"
    echo "📊 Traefik dashboard: http://localhost:8080 (if enabled)"
else
    echo "❌ Application failed to start. Check logs with: ${COMPOSE} logs"
    exit 1
fi

echo "📝 Useful commands:"
echo "  View logs: ${COMPOSE} logs -f"
echo "  Stop app: ${COMPOSE} down"
echo "  Restart app: ${COMPOSE} restart"

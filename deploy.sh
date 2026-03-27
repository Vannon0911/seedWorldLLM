#!/bin/bash

# SeedWorld Deployment Script
set -e

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
docker-compose build

echo "🔄 Starting application..."
docker-compose up -d

echo "⏳ Waiting for application to be healthy..."
sleep 10

# Check if application is running
if docker-compose ps | grep -q "Up"; then
    echo "✅ Application deployed successfully!"
    echo "🌐 Application is available at: http://localhost:3000"
    echo "🔧 WebSocket endpoint: ws://localhost:8080"
    echo "📊 Traefik dashboard: http://localhost:8080 (if enabled)"
else
    echo "❌ Application failed to start. Check logs with: docker-compose logs"
    exit 1
fi

echo "📝 Useful commands:"
echo "  View logs: docker-compose logs -f"
echo "  Stop app: docker-compose down"
echo "  Restart app: docker-compose restart"

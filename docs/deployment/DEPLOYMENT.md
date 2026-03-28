# SeedWorld Deployment Guide

## Prerequisites

1. **Node.js 18+** - For local development
2. **Docker & Docker Compose** - For containerized deployment
3. **Git** - For version control

## Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run server
# or
node start-server.js

# Application available at:
# HTTP: http://localhost:3000
# WebSocket: ws://localhost:8080
```

## Docker Deployment

### Quick Start (Windows)

```powershell
# Run the deployment script
.\ops\scripts\deploy.ps1

# Or with force restart
.\ops\scripts\deploy.ps1 -Force

# With SSL enabled (requires domain configuration)
.\ops\scripts\deploy.ps1 -EnableSSL
```

### Quick Start (Linux/Mac)

```bash
# Make script executable
chmod +x ops/scripts/deploy.sh

# Run deployment
./ops/scripts/deploy.sh
```

### Manual Docker Steps

```bash
# Build the image
docker compose -f ops/docker/docker-compose.yml build

# Start the application
docker compose -f ops/docker/docker-compose.yml up -d

# View logs
docker compose -f ops/docker/docker-compose.yml logs -f

# Stop the application
docker compose -f ops/docker/docker-compose.yml down
```

## Production Configuration

### Environment Variables

Create a `.env` file for production:

```env
NODE_ENV=production
PORT=3000
WS_PORT=8080
```

### SSL/HTTPS Setup

1. Update `ops/docker/docker-compose.yml` with your domain:
   ```yaml
   labels:
     - "traefik.http.routers.seedworld.rule=Host(`your-domain.com`)"
     - "traefik.http.routers.seedworld.tls=true"
     - "traefik.http.routers.seedworld.tls.certresolver=letsencrypt"
     - "certificatesresolvers.letsencrypt.acme.email=your-email@example.com"
   ```

2. Run with SSL enabled:
   ```bash
   docker compose -f ops/docker/docker-compose.yml up -d
   ```

### Cloud Deployment

#### AWS ECS
```bash
# Build and push to ECR
docker build -t seedworld:latest .
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com
docker tag seedworld:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/seedworld:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/seedworld:latest
```

#### Google Cloud Run
```bash
# Build and deploy
gcloud builds submit --tag gcr.io/PROJECT-ID/seedworld
gcloud run deploy seedworld --image gcr.io/PROJECT-ID/seedworld --platform managed
```

#### Azure Container Instances
```bash
# Deploy to ACI
az container create \
  --resource-group seedworld-rg \
  --name seedworld \
  --image seedworld:latest \
  --dns-name-label seedworld-unique \
  --ports 3000 8080
```

## Monitoring

### Health Checks

The application includes built-in health checks:
- HTTP endpoint: `http://localhost:3000`
- Docker health check every 30 seconds

### Logs

```bash
# View application logs
docker compose -f ops/docker/docker-compose.yml logs -f seedworld

# View all logs
docker compose -f ops/docker/docker-compose.yml logs -f
```

## Troubleshooting

### Common Issues

1. **Port conflicts**: Ensure ports 3000 and 8080 are available
2. **Docker not running**: Start Docker Desktop
3. **Permission issues**: Run with appropriate permissions

### Debug Commands

```bash
# Check container status
docker compose -f ops/docker/docker-compose.yml ps

# Enter container for debugging
docker compose -f ops/docker/docker-compose.yml exec seedworld sh

# Restart services
docker compose -f ops/docker/docker-compose.yml restart
```

## Security Considerations

- Application runs as non-root user in container
- CORS is configured for specific origins
- Request size limits are enforced (5MB)
- Request timeouts are set (30 seconds)

## Backup and Recovery

```bash
# Export container data
docker compose -f ops/docker/docker-compose.yml exec seedworld tar czf /tmp/backup.tar.gz /app/data

# Import container data
docker compose -f ops/docker/docker-compose.yml exec seedworld tar xzf /tmp/backup.tar.gz -C /app
```

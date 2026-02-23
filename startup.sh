#!/bin/bash

# Custom startup script for Azure App Service
echo "Starting custom startup script..."

# Navigate to app directory
cd /home/site/wwwroot

# Skip npm install since we're deploying compiled code
# Skip prisma generate since we're deploying pre-generated client

# Start the application
echo "Starting Node.js application..."
node dist/index.js

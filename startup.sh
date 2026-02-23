#!/bin/bash

# Custom startup script for Azure App Service
echo "Starting custom startup script..."

# Navigate to app directory
cd /home/site/wwwroot

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "node_modules not found, running npm install..."
    npm install
else
    echo "node_modules already exists"
fi

# Generate Prisma client if needed
echo "Running prisma generate..."
npx prisma generate

# Start the application
echo "Starting Node.js application..."
node dist/index.js

#!/bin/bash

echo "Starting deployment..."

# Install dependencies if package.json exists
if [ -f "$DEPLOYMENT_TARGET/package.json" ]; then
    echo "Installing dependencies..."
    npm install --production
fi

echo "Deployment completed!"

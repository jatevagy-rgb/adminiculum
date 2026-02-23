#!/bin/bash
# Custom startup script for Azure App Service
echo "Starting Node.js application..."
cd /home/site/wwwroot
node dist/index.js

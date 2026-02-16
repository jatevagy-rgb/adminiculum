#!/bin/bash

# Azure Deployment Script for LWP Backend
# This script prepares the project for Azure App Service deployment

echo "Cleaning previous build..."
rm -rf dist
rm -rf node_modules

echo "Installing dependencies..."
npm install

echo "Generating Prisma client..."
npx prisma generate

echo "Building TypeScript..."
npm run build

echo ""
echo "Files to deploy:"
echo "   - dist/         (compiled JavaScript)"
echo "   - node_modules/ (production dependencies)"
echo "   - package.json"
echo "   - package-lock.json"
echo "   - prisma/"
echo "   - .deployment"
echo "   - templates/"
echo ""

echo "Creating deployment zip..."
zip -r deploy-azure.zip dist node_modules package.json package-lock.json prisma .deployment templates

echo ""
echo "Deployment zip created: deploy-azure.zip"
echo ""
echo "Upload this zip to Azure using:"
echo "   Azure Portal: Deployment Center -> Zip deploy"
echo "   Or Azure CLI: az webapp deployment source config-zip --resource-group <rg> --name <app-name> --src deploy-azure.zip"

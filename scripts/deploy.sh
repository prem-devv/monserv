#!/bin/bash
set -e

echo "Monserv Deployment Script"
echo "========================"

echo "Installing dependencies..."
npm install

echo "Building API..."
cd apps/api && npm run build && cd ../..

echo "Building Web..."
cd apps/web && npm run build && cd ../..

echo ""
echo "Monserv is ready!"
echo ""
echo "To start:"
echo "  Development:  npm run dev"
echo "  Production:   pm2 start ecosystem.config.js"
echo ""
echo "Dashboard:      http://localhost:3000"
echo "Status page:    http://localhost:3000/status"

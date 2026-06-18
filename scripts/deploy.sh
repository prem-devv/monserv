#!/bin/bash

echo "Monserv Deployment Script"
echo "========================"

echo "Installing system dependencies..."
if command -v apt-get &> /dev/null; then
    sudo apt-get update
    sudo apt-get install -y nodejs npm redis-server git build-essential python3
elif command -v apk &> /dev/null; then
    sudo apk add nodejs npm redis git
elif command -v yum &> /dev/null; then
    sudo yum install -y nodejs npm redis git
fi

echo "Checking Node.js version..."
node --version
npm --version

echo "Installing Redis..."
if command -v systemctl &> /dev/null; then
    sudo systemctl enable redis
    sudo systemctl start redis
fi

echo "Installing project dependencies..."
npm install

echo "Building API..."
cd apps/api && npm run build

echo "Building Web..."
cd ../web && npm run build

echo ""
echo "Monserv is ready!"
echo ""
echo "To start the application:"
echo "  1. Start Redis: redis-server"
echo "  2. Start API:  npm run dev:api"
echo "  3. Start Web: npm run dev:web"
echo ""
echo "Or run everything at once: npm run dev"
echo ""
echo "Access the dashboard at: http://localhost:3000"
echo "Public status page:   http://localhost:3000/status"
echo "API documentation:   http://localhost:3001/docs"
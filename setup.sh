#!/bin/bash

set -e

echo "🚀 OutreachOS Setup"
echo "=================="

# Create .env if it doesn't exist
if [ ! -f .env ]; then
  echo "📝 Creating .env from .env.example..."
  cp .env.example .env
  echo "✓ .env created. Please update it with your API keys."
else
  echo "✓ .env already exists"
fi

# Frontend setup
echo ""
echo "📦 Installing frontend dependencies..."
cd frontend
npm install
cd ..
echo "✓ Frontend dependencies installed"

# Backend setup
echo ""
echo "📦 Installing backend dependencies..."
cd backend
npm install
cd ..
echo "✓ Backend dependencies installed"

# Create data directory
mkdir -p backend/data
echo "✓ Data directory created"

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Update .env with your API keys"
echo "2. Run: npm run dev (in frontend directory)"
echo "3. Run: npm run dev (in backend directory)"
echo "4. Open http://localhost:5173"
echo ""

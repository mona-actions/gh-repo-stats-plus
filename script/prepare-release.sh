#!/usr/bin/env bash

set -e

echo "🏗️  Preparing extension for release..."

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Change to the project directory
cd "$PROJECT_DIR"

echo "📦 Installing dependencies..."
npm install

echo "🧪 Running tests..."
npm test

echo "📝 Running linter..."
npm run lint

echo "🔧 Building extension..."
npm run build

echo "✅ Verifying build output..."
if [ ! -f "dist/index.js" ]; then
    echo "❌ Error: dist/index.js not found after build"
    exit 1
fi

# Check if the built file is executable
if [ ! -x "dist/index.js" ]; then
    echo "🔧 Making dist/index.js executable..."
    chmod +x dist/index.js
fi

echo "✅ Extension is ready for release!"
echo ""
echo "📋 Next steps:"
echo "   1. Commit the changes: git add dist/ && git commit -m 'Update built extension'"
echo "   2. Create a release: gh release create vX.X.X"
echo "   3. Users can install with: gh extension install your-org/gh-repo-stats-plus"

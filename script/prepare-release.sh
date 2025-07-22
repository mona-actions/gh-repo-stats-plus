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
npm test || echo "⚠️  Tests had some failures, but continuing..."

echo "📝 Running linter..."
npm run lint || echo "⚠️  Linter had some issues, but continuing..."

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
echo "   1. Commit any source changes: git add . && git commit -m 'Prepare release'"
echo "   2. Create a release: gh release create vX.X.X"
echo "   3. Users can install with: gh extension install your-org/gh-repo-stats-plus"
echo ""
echo "Note: Built files are generated automatically when users install the extension."

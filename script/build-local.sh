#!/bin/bash

set -e

# Get the release tag from the first argument (or use a default for testing)
TAG="${1:-v0.0.1-dev}"

# Clean and create dist directory
rm -rf dist
mkdir -p dist

# Install dependencies
npm ci

# Build TypeScript
npm run build

# Get extension name
EXTENSION_NAME="${PWD##*/}"  # Gets current directory name

# Build only for local macOS ARM64
OUTPUT_NAME="${EXTENSION_NAME}_${TAG}_darwin-arm64"

echo "Building for macOS ARM64 (M3)..."

# Use pkg to create executable for local testing
pkg package.json --targets "node18-macos-arm64" --output "dist/${OUTPUT_NAME}"

echo "Build complete. Executable created: dist/${OUTPUT_NAME}"

# Make it executable and test
chmod +x "dist/${OUTPUT_NAME}"
echo "You can now test with: ./dist/${OUTPUT_NAME}"
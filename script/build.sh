#!/bin/bash

set -e

# Get the release tag from the first argument
TAG="$1"

# Clean and create dist directory
rm -rf dist
mkdir -p dist

# Install dependencies
npm ci

# Build TypeScript
npm run build

# Get extension name from package.json or set it manually
EXTENSION_NAME="${GITHUB_REPOSITORY##*/}"  # Gets repo name from owner/repo

# Define target platforms (same as Go's supported platforms)
PLATFORMS="darwin-amd64 darwin-arm64 linux-386 linux-amd64 linux-arm linux-arm64 windows-386 windows-amd64"

# Build for each platform
for PLATFORM in $PLATFORMS; do
    IFS='-' read -ra PARTS <<< "$PLATFORM"
    OS="${PARTS[0]}"
    ARCH="${PARTS[1]}"
    
    OUTPUT_NAME="${EXTENSION_NAME}_${TAG}_${OS}-${ARCH}"
    if [ "$OS" = "windows" ]; then
        OUTPUT_NAME="${OUTPUT_NAME}.exe"
    fi
    
    echo "Building for $OS/$ARCH..."
    
    # Use a tool like pkg or esbuild to create standalone executables
    # This example uses pkg (install with: npm install -g pkg)
    pkg package.json --targets "node18-${OS}-${ARCH}" --output "dist/${OUTPUT_NAME}"
done

echo "Build complete. Executables created in dist/"
ls -la dist/
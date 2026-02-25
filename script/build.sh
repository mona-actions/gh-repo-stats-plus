#!/bin/bash

set -e

# Get the release tag from the first argument
TAG="$1"

if [ -z "$TAG" ]; then
    echo "Error: Release tag is required as first argument"
    exit 1
fi

echo "Building for release tag: $TAG"

# Clean and create dist directory
rm -rf dist
mkdir -p dist

# Install dependencies
npm ci

# Build TypeScript bundle
npm run bundle

# Get extension name from repository
# The syntax ${GITHUB_REPOSITORY##*/} removes everything up to and including the last slash
EXTENSION_NAME="${GITHUB_REPOSITORY##*/}"
if [ -z "$EXTENSION_NAME" ]; then
    # Fallback to directory name if GITHUB_REPOSITORY not set
    EXTENSION_NAME="${PWD##*/}"
fi

echo "Extension name: $EXTENSION_NAME"

# Define target platforms (as per GitHub CLI extension requirements)
PLATFORMS=(
    "darwin-amd64"
    "darwin-arm64" 
    "linux-386"
    "linux-amd64"
    "linux-arm"
    "linux-arm64"
    "windows-386"
    "windows-amd64"
)

# Build for each platform using pkg
for PLATFORM in "${PLATFORMS[@]}"; do
    IFS='-' read -ra PARTS <<< "$PLATFORM"
    OS="${PARTS[0]}"
    ARCH="${PARTS[1]}"
    
    OUTPUT_NAME="${EXTENSION_NAME}_${TAG}_${OS}-${ARCH}"
    
    # Map GitHub CLI arch names to pkg arch names
    case "$ARCH" in
        "amd64") PKG_ARCH="x64" ;;
        "386") PKG_ARCH="x32" ;;
        "arm64") PKG_ARCH="arm64" ;;
        "arm") PKG_ARCH="armv7" ;;
        *) PKG_ARCH="$ARCH" ;;
    esac
    
    # Add .exe extension for Windows
    if [ "$OS" = "windows" ]; then
        OUTPUT_NAME="${OUTPUT_NAME}.exe"
        PKG_TARGET="node20-win-${PKG_ARCH}"
    else
        PKG_TARGET="node20-${OS}-${PKG_ARCH}"
    fi
    
    echo "Building for ${OS}/${ARCH} (pkg: ${PKG_TARGET})..."
    
    # Use pkg to create standalone executable
    if npx pkg dist/index.js \
        --targets "$PKG_TARGET" \
        --output "dist/${OUTPUT_NAME}" \
        --compress GZip; then
        echo "✓ Created: dist/${OUTPUT_NAME}"
    else
        echo "✗ Failed to create: dist/${OUTPUT_NAME}"
    fi
done

echo "Build complete. Executables created in dist/"
ls -la dist/

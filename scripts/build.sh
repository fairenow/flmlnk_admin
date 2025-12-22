#!/bin/bash
# Build script for Next.js only
# Convex is deployed separately to avoid conflicts with user-facing app

set -e

echo "Starting build process..."

# Build Next.js
echo "Building Next.js..."
npx next build

echo "Build completed successfully!"

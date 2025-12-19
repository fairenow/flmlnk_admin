#!/bin/bash
# Build script with retry logic for Convex deployment
# Handles transient OptimisticConcurrencyControlFailure errors

set -e

MAX_RETRIES=4
RETRY_DELAY=2

convex_deploy_with_retry() {
  local attempt=1
  local delay=$RETRY_DELAY

  while [ $attempt -le $MAX_RETRIES ]; do
    echo "Convex deploy attempt $attempt of $MAX_RETRIES..."

    if npx convex deploy; then
      echo "Convex deploy succeeded on attempt $attempt"
      return 0
    fi

    if [ $attempt -lt $MAX_RETRIES ]; then
      echo "Convex deploy failed. Retrying in ${delay}s..."
      sleep $delay
      delay=$((delay * 2))  # Exponential backoff: 2s, 4s, 8s
    fi

    attempt=$((attempt + 1))
  done

  echo "Convex deploy failed after $MAX_RETRIES attempts"
  return 1
}

echo "Starting build process..."

# Deploy Convex with retry logic
convex_deploy_with_retry

# Build Next.js
echo "Building Next.js..."
npx next build

echo "Build completed successfully!"

#!/bin/bash

# ============================================================================
# Docker Build & Push Script for PFE Application
# Author: ousssama
# Description: Automated script to build and push Docker images to Docker Hub
# ============================================================================

set -e

# Configuration
DOCKER_REGISTRY="docker.io"
DOCKER_USERNAME="ousssama"
NAMESPACE="${DOCKER_USERNAME}"
APP_NAME="pfe"
VERSION="${1:-latest}"

# Image names
BACKEND_IMAGE="${NAMESPACE}/${APP_NAME}-backend:${VERSION}"
FRONTEND_IMAGE="${NAMESPACE}/${APP_NAME}-frontend:${VERSION}"
BACKEND_IMAGE_LATEST="${NAMESPACE}/${APP_NAME}-backend:latest"
FRONTEND_IMAGE_LATEST="${NAMESPACE}/${APP_NAME}-frontend:latest"

echo "=========================================================================="
echo "PFE Docker Build & Push Script"
echo "=========================================================================="
echo "Docker Username: ${DOCKER_USERNAME}"
echo "App Name: ${APP_NAME}"
echo "Version: ${VERSION}"
echo "=========================================================================="

# Check if logged in to Docker Hub
echo "Checking Docker login status..."
if ! docker info | grep -q "Username:"; then
    echo "❌ Not logged in to Docker. Please run: docker login"
    exit 1
fi
echo "✅ Docker login verified"

# Build Backend Image
echo ""
echo "=========================================================================="
echo "Building Backend Image: ${BACKEND_IMAGE}"
echo "=========================================================================="
docker build \
  --tag "${BACKEND_IMAGE}" \
  --tag "${BACKEND_IMAGE_LATEST}" \
  --file PFE-BACKEND/Dockerfile \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  PFE-BACKEND/

if [ $? -eq 0 ]; then
  echo "✅ Backend image built successfully"
else
  echo "❌ Failed to build backend image"
  exit 1
fi

# Build Frontend Image
echo ""
echo "=========================================================================="
echo "Building Frontend Image: ${FRONTEND_IMAGE}"
echo "=========================================================================="
docker build \
  --tag "${FRONTEND_IMAGE}" \
  --tag "${FRONTEND_IMAGE_LATEST}" \
  --file PFE-FRONTEND/Dockerfile \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  PFE-FRONTEND/

if [ $? -eq 0 ]; then
  echo "✅ Frontend image built successfully"
else
  echo "❌ Failed to build frontend image"
  exit 1
fi

# Check image sizes
echo ""
echo "=========================================================================="
echo "Image Sizes:"
echo "=========================================================================="
docker images | grep "${NAMESPACE}/${APP_NAME}" | awk '{print $1 ":" $2 " -> " $5}'

# Push Backend Image
echo ""
echo "=========================================================================="
echo "Pushing Backend Image to Docker Hub: ${BACKEND_IMAGE}"
echo "=========================================================================="
docker push "${BACKEND_IMAGE}"
docker push "${BACKEND_IMAGE_LATEST}"

if [ $? -eq 0 ]; then
  echo "✅ Backend image pushed successfully"
else
  echo "❌ Failed to push backend image"
  exit 1
fi

# Push Frontend Image
echo ""
echo "=========================================================================="
echo "Pushing Frontend Image to Docker Hub: ${FRONTEND_IMAGE}"
echo "=========================================================================="
docker push "${FRONTEND_IMAGE}"
docker push "${FRONTEND_IMAGE_LATEST}"

if [ $? -eq 0 ]; then
  echo "✅ Frontend image pushed successfully"
else
  echo "❌ Failed to push frontend image"
  exit 1
fi

echo ""
echo "=========================================================================="
echo "✅ All images built and pushed successfully!"
echo "=========================================================================="
echo ""
echo "Images available at Docker Hub:"
echo "  - ${BACKEND_IMAGE}"
echo "  - ${BACKEND_IMAGE_LATEST}"
echo "  - ${FRONTEND_IMAGE}"
echo "  - ${FRONTEND_IMAGE_LATEST}"
echo ""
echo "To pull and run:"
echo "  docker pull ${BACKEND_IMAGE}"
echo "  docker pull ${FRONTEND_IMAGE}"
echo ""
echo "For Kubernetes deployment, use:"
echo "  ${BACKEND_IMAGE}"
echo "  ${FRONTEND_IMAGE}"
echo "=========================================================================="

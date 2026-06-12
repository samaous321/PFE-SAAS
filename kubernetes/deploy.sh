#!/bin/bash

# ============================================================================
# Kubernetes Deployment Script for PFE Application
# ============================================================================

set -e

NAMESPACE="pfe"
KUBECONFIG="${KUBECONFIG:-.kubeconfig}"

echo "=========================================================================="
echo "PFE Kubernetes Deployment"
echo "=========================================================================="

# Check kubectl connection
echo "Checking Kubernetes cluster..."
if ! kubectl cluster-info &> /dev/null; then
    echo "❌ Cannot connect to Kubernetes cluster"
    echo "   Please check your kubeconfig: $KUBECONFIG"
    exit 1
fi
echo "✅ Kubernetes cluster connected"

# Check if namespace exists
if kubectl get namespace "$NAMESPACE" &> /dev/null; then
    echo "✅ Namespace '$NAMESPACE' exists"
else
    echo "Creating namespace '$NAMESPACE'..."
    kubectl create namespace "$NAMESPACE"
    kubectl label namespace "$NAMESPACE" name="$NAMESPACE"
fi

# Apply configurations
echo ""
echo "=========================================================================="
echo "Applying Kubernetes manifests..."
echo "=========================================================================="

# Apply in order
kubectl apply -f kubernetes/00-namespace-config.yaml
echo "✅ Namespace and ConfigMaps applied"

kubectl apply -f kubernetes/01-mongodb.yaml
echo "✅ MongoDB deployed"

kubectl apply -f kubernetes/02-redis.yaml
echo "✅ Redis deployed"

kubectl apply -f kubernetes/03-minio.yaml
echo "✅ MinIO deployed"

# Wait for databases
echo ""
echo "Waiting for databases to be ready..."
kubectl wait --for=condition=ready pod -l app=mongodb -n "$NAMESPACE" --timeout=300s
kubectl wait --for=condition=ready pod -l app=redis -n "$NAMESPACE" --timeout=300s
kubectl wait --for=condition=ready pod -l app=minio -n "$NAMESPACE" --timeout=300s

echo "✅ All databases ready"

kubectl apply -f kubernetes/04-backend.yaml
echo "✅ Backend deployed"

kubectl apply -f kubernetes/05-frontend.yaml
echo "✅ Frontend deployed"

kubectl apply -f kubernetes/06-network-policy.yaml
echo "✅ Network policies applied"

# Show status
echo ""
echo "=========================================================================="
echo "Deployment Status"
echo "=========================================================================="
kubectl get all -n "$NAMESPACE"

echo ""
echo "=========================================================================="
echo "Service Endpoints"
echo "=========================================================================="
kubectl get svc -n "$NAMESPACE"

echo ""
echo "=========================================================================="
echo "Port Forwarding (optional):"
echo "=========================================================================="
echo "kubectl port-forward -n $NAMESPACE svc/pfe-frontend 80:80"
echo "kubectl port-forward -n $NAMESPACE svc/pfe-backend 3000:3000"
echo "kubectl port-forward -n $NAMESPACE svc/minio 9001:9001"

echo ""
echo "=========================================================================="
echo "✅ Deployment complete!"
echo "=========================================================================="

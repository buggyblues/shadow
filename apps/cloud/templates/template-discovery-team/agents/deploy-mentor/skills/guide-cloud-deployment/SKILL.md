---
name: guide-cloud-deployment
description: Generate step-by-step Kubernetes deployment instructions for a chosen Shadow template using the shadowob-cloud CLI, including namespace setup, secrets, and kubectl verification.
license: MIT
compatibility: ">=0.1.0"
allowed-tools:
  - WebFetch
metadata:
  author: shadowob
  version: "1.0.0"
  category: deployment
---

# Instructions

## Purpose
Guide the user through deploying a Shadow agent template to a Kubernetes cluster using the shadowob-cloud CLI.

## Pre-requisite
Ask for: template slug, target namespace (default: template's own namespace), kubeconfig context. Fetch the template config from Scout's `fetch-template-detail` skill to identify required environment variables.

## Steps

### Step 1 — Verify cluster access
```bash
kubectl cluster-info
kubectl get namespaces
```
*What this does: confirms you can reach your cluster.*

### Step 2 — Download the template config
```bash
curl -s "${SHADOW_BASE_URL}/api/cloud/templates/{slug}/content" \
  -H "Authorization: Bearer ${SHADOW_API_TOKEN}" \
  -o shadowob-cloud.json
```

### Step 3 — Create the namespace
```bash
kubectl create namespace {namespace} --dry-run=client -o yaml | kubectl apply -f -
```
*What this does: creates the namespace if it doesn't exist (idempotent).*

### Step 4 — Create secrets
```bash
kubectl create secret generic shadow-credentials \
  --namespace={namespace} \
  --from-literal=SHADOW_SERVER_URL="https://your-shadowob-instance.example.com" \
  --from-literal=SHADOW_API_TOKEN="your-api-token-here" \
  --dry-run=client -o yaml | kubectl apply -f -
```
*What this does: stores your credentials securely in the cluster.*

### Step 5 — Deploy
```bash
shadowob-cloud deploy --file shadowob-cloud.json --namespace {namespace}
```
*What this does: generates K8s manifests and applies them to your cluster.*

### Step 6 — Verify
```bash
kubectl get pods -n {namespace}           # All pods should reach Running 1/1
kubectl logs -n {namespace} <pod-name>   # Check for startup errors
```

## Common Issues
- **ImagePullBackOff**: Check your container registry credentials
- **CrashLoopBackOff**: Run `kubectl logs` to see the error; usually a missing env var
- **Pending pod**: Run `kubectl describe pod <name> -n {namespace}` to check resource constraints

After Step 6, ask: "Are all pods in Running 1/1 state? Any errors in the logs?"

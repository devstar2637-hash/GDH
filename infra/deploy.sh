#!/usr/bin/env bash
# infra/deploy.sh — Taehyeon only. Builds from repo root and deploys to Cloud Run.
# Secrets: GEMINI_API_KEY is injected from Secret Manager, never baked into the image.
set -euo pipefail
PROJECT="${GCP_PROJECT:?set GCP_PROJECT}"; REGION="${GCP_REGION:-asia-northeast3}"; SERVICE="${SERVICE:-thousand-stores}"
gcloud config set project "$PROJECT" >/dev/null
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com >/dev/null
if ! gcloud secrets describe gemini-api-key >/dev/null 2>&1; then
  echo "Create the secret first:  printf '%s' \"\$GEMINI_API_KEY\" | gcloud secrets create gemini-api-key --data-file=-"; exit 1; fi
gcloud run deploy "$SERVICE" --source . --region "$REGION" --allow-unauthenticated --port 8080 \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest --set-env-vars GEMINI_MODEL=gemini-4-argon,GEMINI_FAST_MODEL=gemini-3.8-flash \
  --max-instances 3 --concurrency 20 --timeout 900 --memory 1Gi
gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)'

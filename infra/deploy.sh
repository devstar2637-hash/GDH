#!/usr/bin/env bash
# Builds the root Dockerfile and deploys to the explicitly selected Cloud project.
# Secrets: GEMINI_API_KEY is injected from Secret Manager, never baked into the image.
set -euo pipefail
PROJECT="${GCP_PROJECT:?set GCP_PROJECT}"; REGION="${GCP_REGION:-asia-northeast3}"; SERVICE="${SERVICE:-thousand-stores}"
cd "$(dirname "$0")/.."
if [[ -z "$(gcloud auth list --filter=status:ACTIVE --format='value(account)')" ]]; then
  echo 'Cloud CLI login is required: gcloud auth login' >&2; exit 1
fi
ENGINE_REV="$(git rev-parse HEAD)"
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo 'Commit the deployment source first so ENGINE_SHA identifies the actual source.' >&2; exit 1
fi
DEPLOY_ARGS=(--source . --project "$PROJECT" --region "$REGION" --allow-unauthenticated --port 8080
  --max-instances 1 --concurrency 4 --timeout 120 --memory 1Gi --quiet)
if [[ "${DEPLOY_WITHOUT_GEMINI:-0}" != 1 ]]; then
  if ! gcloud secrets describe gemini-api-key --project "$PROJECT" >/dev/null 2>&1; then
    echo 'Configure the gemini-api-key Secret Manager secret first. Do not paste the key into chat.' >&2; exit 1
  fi
  DEPLOY_ARGS+=(--set-secrets GEMINI_API_KEY=gemini-api-key:latest)
fi
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project "$PROJECT" --quiet >/dev/null
gcloud run deploy "$SERVICE" "${DEPLOY_ARGS[@]}" \
  --set-env-vars "GEMINI_MODEL=${GEMINI_MODEL:-gemini-4-argon},ENGINE_SHA=$ENGINE_REV"
gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format='value(status.url)'

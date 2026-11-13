#!/usr/bin/env bash
# Builds the images in ACR (no local Docker needed) and deploys main.bicep. Idempotent: re-run to update.
#   RESOURCE_GROUP=rg-nx LOCATION=westeurope ./deploy/azure/deploy.sh
# Secrets via env (see main.bicepparam), e.g. from a .env that is not committed:
#   set -a; source deploy/azure/.env; set +a
# Parts: DEPLOY_CACHE=false / DEPLOY_METRICS=false. Requires: az (logged in), git.
set -euo pipefail

: "${RESOURCE_GROUP:?set RESOURCE_GROUP}"
LOCATION="${LOCATION:-westeurope}"
export PREFIX="${PREFIX:-nx}"
export DEPLOY_CACHE="${DEPLOY_CACHE:-true}"
export DEPLOY_METRICS="${DEPLOY_METRICS:-true}"

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"

require() { [ -n "${!1:-}" ] || { echo "missing env $1" >&2; exit 1; }; }
if [ "$DEPLOY_CACHE" = true ]; then
  [ -n "${NX_CACHE_CI_TOKENS:-}${NX_CACHE_READ_ONLY_TOKENS:-}${NX_CACHE_DEV_TOKENS:-}" ] \
    || { echo "set NX_CACHE_CI_TOKENS, NX_CACHE_READ_ONLY_TOKENS and/or NX_CACHE_DEV_TOKENS" >&2; exit 1; }
fi
if [ "$DEPLOY_METRICS" = true ]; then
  for name in COLLECTOR_TOKENS POSTGRES_ADMIN_PASSWORD GRAFANA_READER_PASSWORD GRAFANA_ADMIN_PASSWORD; do require "$name"; done
fi

az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none

# ACR name: global, alphanumeric; stable per subscription + resource group unless ACR_NAME is set
if [ -z "${ACR_NAME:-}" ]; then
  hash="$(printf '%s' "$(az account show --query id -o tsv)/$RESOURCE_GROUP" | shasum | cut -c1-10)"
  ACR_NAME="${PREFIX//-/}acr${hash}"
fi
export ACR_NAME
az acr show --name "$ACR_NAME" --output none 2>/dev/null \
  || az acr create --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --sku Basic --admin-enabled false --output none

export IMAGE_TAG="${IMAGE_TAG:-$(git -C "$repo" rev-parse --short HEAD)$(git -C "$repo" diff --quiet HEAD || echo -dirty)}"
build() { echo "build $1:$IMAGE_TAG"; az acr build --registry "$ACR_NAME" --image "$1:$IMAGE_TAG" "$2" --output none; }
[ "$DEPLOY_CACHE" = true ] && build nx-remote-cache-custom "$repo/packages/nx-remote-cache-custom"
if [ "$DEPLOY_METRICS" = true ]; then
  build nx-metrics-collector "$repo/packages/nx-metrics-collector"
  build nx-metrics-grafana "$repo/packages/nx-metrics-collector/docker/grafana"
fi

az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --name "nx-$(date +%Y%m%d-%H%M%S)" \
  --parameters "$here/main.bicepparam" \
  --query properties.outputs --output json

#!/usr/bin/env bash
# Deploys the single-host stack to a machine reachable via SSH (Docker must run there).
#   packages/nx-remote-cache-custom/docker/single-host/deploy.sh <ssh-target> <remote-dir> [data-dir]
#   e.g. deploy.sh macmini@mac-mini.fritz.box /Volumes/DevSSD/nx-cache
# First run: generates <remote-dir>/.env with random secrets (data-dir default: <remote-dir>/minio-data).
# Later runs: copy compose/config/sources, rebuild, restart changed services; .env stays untouched.
set -euo pipefail

target=${1:?usage: deploy.sh <ssh-target> <remote-dir> [data-dir]}
remote_dir=${2:?usage: deploy.sh <ssh-target> <remote-dir> [data-dir]}
data_dir=${3:-$remote_dir/minio-data}
here=$(cd "$(dirname "$0")" && pwd)
packages=$(cd "$here/../../.." && pwd)

# Docker Desktop's CLI lives in /usr/local/bin, which non-interactive SSH shells on macOS don't have on PATH
remote() { ssh -o BatchMode=yes "$target" "export PATH=/usr/local/bin:/opt/homebrew/bin:\$PATH; $1"; }

echo "→ $target:$remote_dir"
remote "mkdir -p '$remote_dir/src' '$remote_dir/secrets' '$data_dir' && chmod 700 '$remote_dir'"

# --inplace keeps the inode: single-file bind mounts (prometheus.yml, evict.sh) would otherwise keep seeing the old file
rsync -a --inplace "$here/compose.yml" "$here/prometheus.yml" "$here/evict.sh" "$target:$remote_dir/"
rsync -a --delete --exclude node_modules --exclude dist \
  "$packages/nx-remote-cache-custom" "$packages/nx-metrics-collector" "$target:$remote_dir/src/"

# secrets once; the metrics token is also written as a file for Prometheus (credentials_file)
remote "cd '$remote_dir' && if [ ! -f .env ]; then
  umask 077; s() { openssl rand -hex 32; }
  printf '%s\n' \
    'NX_CACHE_DATA_DIR=$data_dir' \
    'MINIO_ROOT_USER=nxcache' \"MINIO_ROOT_PASSWORD=\$(s)\" \
    \"NX_CACHE_CI_TOKENS=ci:\$(s)\" \"NX_CACHE_DEV_TOKENS=dev:\$(s)\" \"NX_CACHE_READ_ONLY_TOKENS=pr:\$(s)\" \
    \"NX_CACHE_METRICS_TOKEN=\$(s)\" \"POSTGRES_PASSWORD=\$(s)\" \"COLLECTOR_TOKENS=\$(s)\" \
    \"GRAFANA_ADMIN_PASSWORD=\$(openssl rand -hex 12)\" > .env
  echo '  generated .env (copy it to your password manager)'
fi
sed -n 's/^NX_CACHE_METRICS_TOKEN=//p' .env | tr -d '\n' > secrets/metrics-token && chmod 644 secrets/metrics-token"

remote "cd '$remote_dir' && docker compose up -d --build --remove-orphans"
# prometheus.yml is bind-mounted: a changed file does not recreate the container, so reload it explicitly
remote "cd '$remote_dir' && docker compose kill -s SIGHUP prometheus >/dev/null"

host=${target#*@}
for i in $(seq 1 30); do
  curl -fsS -m 3 "http://$host:3100/health" >/dev/null 2>&1 && { echo "✓ cache healthy: http://$host:3100 · grafana http://$host:3310"; exit 0; }
  sleep 2
done
echo "✗ cache not healthy after 60 s: ssh $target 'cd $remote_dir && docker compose logs cache'" >&2
exit 1

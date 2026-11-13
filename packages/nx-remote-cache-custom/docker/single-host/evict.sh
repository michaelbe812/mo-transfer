#!/bin/bash
# Size cap for the nx-cache bucket: when usage > EVICT_HIGH_GIB, delete oldest entries until < EVICT_LOW_GIB.
# Age cap (5 days) is the MinIO ILM rule (minio-init); hard cap is the bucket quota (100 GiB).
set -u
GIB=$((1024 ** 3))
HIGH=$((EVICT_HIGH_GIB * GIB)); LOW=$((EVICT_LOW_GIB * GIB))
mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null

json_field() { [[ $1 =~ \"$2\":\"?([^\",}]*) ]] && echo "${BASH_REMATCH[1]}"; }

evict_once() {
  local usage; usage=$(json_field "$(mc du --json local/nx-cache)" size)
  [[ -z $usage ]] && { echo "$(date -u +%FT%TZ) evict: cannot read usage"; return; }
  (( usage <= HIGH )) && return
  echo "$(date -u +%FT%TZ) evict: usage $((usage / GIB)) GiB > $EVICT_HIGH_GIB GiB, trimming to $EVICT_LOW_GIB GiB"
  local deleted=0 line modified size key
  # oldest first: "lastModified size key"
  while read -r modified size key; do
    (( usage <= LOW )) && break
    mc rm --quiet "local/nx-cache/$key" >/dev/null && { usage=$((usage - size)); deleted=$((deleted + 1)); }
  done < <(mc ls --recursive --json local/nx-cache | while read -r line; do
             [[ $(json_field "$line" type) == file ]] || continue
             printf '%s %s %s\n' "$(json_field "$line" lastModified)" "$(json_field "$line" size)" "$(json_field "$line" key)"
           done | sort)
  echo "$(date -u +%FT%TZ) evict: deleted $deleted entries, usage now ~$((usage / GIB)) GiB"
}

while true; do evict_once; sleep "$EVICT_INTERVAL_SECONDS"; done

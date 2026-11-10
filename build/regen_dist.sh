#!/usr/bin/env bash
# Regenerate dist/<env>/ (Scalar-prebuilt JSON + manifest.json) from base/ and portal/.
# Run after ANY change to base/<service>/<env>.yaml, portal/index.html or portal/assets/.
# Needs local Chrome and `npm ci` in build/scalar_prebuild/ (done here if missing).
#
# Usage: build/regen_dist.sh [env ...]     (default: prod preprod stage demo)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENVS=("$@")
[[ ${#ENVS[@]} -gt 0 ]] || ENVS=(prod preprod stage demo)

[[ -d build/scalar_prebuild/node_modules ]] || (cd build/scalar_prebuild && npm ci --silent)

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

for env in "${ENVS[@]}"; do
  echo "== $env"
  site="$TMP/$env"
  SKIP_PREBUILD_CHECK=1 build/assemble_site.sh "$env" "$site" >/dev/null
  # assemble rewrites index.html (favicon); the manifest must hash the repo's portal/index.html
  cp portal/index.html "$site/index.html"
  node build/scalar_prebuild/prebuild.mjs "$site" index.html
  cp "$site"/scalar-docs/*.json "$ROOT/dist/$env/"
done

echo "Done. Verify: for e in prod preprod stage demo; do build/assemble_site.sh \$e /tmp/site-\$e; done"

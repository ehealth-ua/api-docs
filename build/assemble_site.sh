#!/usr/bin/env bash
# Assemble the publishable site for one environment and verify it is not stale.
#
# The repository layout (base/, dist/, portal/) differs from the layout the page
# expects when served (index.html loads scalar-docs/<service>.json). This script
# maps one to the other, so the published site is:
#
#   <out>/index.html
#   <out>/assets/...
#   <out>/specs/<service>.yaml          <- base/<service>/<env>.yaml
#   <out>/scalar-docs/<service>.json    <- dist/<env>/<service>.json
#   <out>/scalar-docs/manifest.json     <- dist/<env>/manifest.json
#   <out>/favicon.ico                   <- portal/favicon.ico
#
# It then runs prebuild.mjs --check, which fails when a generated document no
# longer matches its spec, the Scalar bundle or index.html (needs only Node, no
# npm install and no browser). Set SKIP_PREBUILD_CHECK=1 on machines without Node.
#
# Usage: build/assemble_site.sh <env> <out-dir>
#   <env>  prod | preprod | stage | demo
set -euo pipefail

ENV_NAME="${1:?usage: assemble_site.sh <env> <out-dir>}"
OUT="${2:?usage: assemble_site.sh <env> <out-dir>}"

case "$ENV_NAME" in
  prod|preprod|stage|demo) ;;
  *) echo "unknown environment: $ENV_NAME (expected prod|preprod|stage|demo)" >&2; exit 1 ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

[[ -f portal/index.html && -d portal/assets ]] || { echo "portal/ is incomplete" >&2; exit 1; }
[[ -d "dist/$ENV_NAME" ]] || { echo "dist/$ENV_NAME is missing" >&2; exit 1; }

rm -rf "$OUT"
mkdir -p "$OUT/specs" "$OUT/scalar-docs"
cp portal/index.html "$OUT/index.html"
cp -R portal/assets "$OUT/assets"

count=0
for dir in base/*/; do
  svc="$(basename "$dir")"
  spec="base/$svc/$ENV_NAME.yaml"
  doc="dist/$ENV_NAME/$svc.json"
  [[ -f "$spec" ]] || { echo "missing $spec" >&2; exit 1; }
  [[ -f "$doc" ]]  || { echo "missing $doc"  >&2; exit 1; }
  cp "$spec" "$OUT/specs/$svc.yaml"
  cp "$doc"  "$OUT/scalar-docs/$svc.json"
  count=$((count + 1))
done
[[ "$count" -gt 0 ]] || { echo "no services found in base/" >&2; exit 1; }

[[ -f "dist/$ENV_NAME/manifest.json" ]] || { echo "missing dist/$ENV_NAME/manifest.json" >&2; exit 1; }
cp "dist/$ENV_NAME/manifest.json" "$OUT/scalar-docs/manifest.json"

if [[ "${SKIP_PREBUILD_CHECK:-}" == "1" ]]; then
  echo "prebuild check skipped (SKIP_PREBUILD_CHECK=1); CI runs it on every PR"
else
  node build/scalar_prebuild/prebuild.mjs --check "$OUT"
fi
# Favicon. Added after the staleness check on purpose: index.html in the repo
# keeps its icon placeholder (so its hash, recorded in the manifests, does not
# change) and the published copy points at portal/favicon.ico.
if [[ -f portal/favicon.ico ]]; then
  cp portal/favicon.ico "$OUT/favicon.ico"
  python3 - "$OUT/index.html" <<'PYEOF'
import re, sys
path = sys.argv[1]
with open(path, encoding="utf-8") as fh:
    html = fh.read()
new, n = re.subn(r'<link rel="icon"[^>]*>', '<link rel="icon" href="favicon.ico" sizes="any" />', html, count=1)
if n != 1:
    sys.exit(f"no <link rel=\"icon\"> found in {path}")
with open(path, "w", encoding="utf-8") as fh:
    fh.write(new)
PYEOF
fi

echo "assembled $ENV_NAME: $count services -> $OUT ($(du -sh "$OUT" | cut -f1))"

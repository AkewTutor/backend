#!/usr/bin/env bash
# Run from backend/.
#   NODE_ENV=development ./scripts/run-all-postman.sh                     # collections 01-06
#   NODE_ENV=development ./scripts/run-all-postman.sh --with-rate-limits  # also 07 (pauses for a server restart)
set -u
P=../postman
ENV_SRC="$P/AkewTutor.postman_environment.json"
ENV_GEN="$P/AkewTutor.postman_environment.generated.json"
failed=()

run_newman() { # $1 = collection path, $2 = number
  npx newman run "$1" -e "$ENV_GEN" --working-dir "$P" \
    --export-environment "$P/after-$2.json" \
    --reporter-cli-no-success-assertions --reporter-cli-no-banner
}

for c in "$P"/0[1-6]-*.postman_collection.json; do
  name=$(basename "$c"); n=${name%%-*}
  echo "=== Running $name ==="
  node scripts/postman-bootstrap.mjs --env "$ENV_SRC" || { failed+=("$name (bootstrap)"); continue; }
  run_newman "$c" "$n" || failed+=("$name")
done

if [ "${1:-}" = "--with-rate-limits" ]; then
  c="$P/07-rate-limits.postman_collection.json"
  echo
  echo "=== Preparing 07-rate-limits ==="
  # Bootstrap logs in many users, so it must run while limiters are still OFF (development server).
  node scripts/postman-bootstrap.mjs --env "$ENV_SRC" || { failed+=("07 (bootstrap)"); }
  echo
  echo "Now restart the API with limiters ON, e.g.:  NODE_ENV=test npm run dev"
  read -r -p "Press Enter when the server is back up... "
  run_newman "$c" 07 || failed+=("07-rate-limits.postman_collection.json")
  echo
  echo "Restart the API in development mode before any further runs (login limiter now blocks this IP)."
fi

echo
if [ ${#failed[@]} -eq 0 ]; then
  echo "All collections passed."
else
  echo "Failed collections:"; printf '  - %s\n' "${failed[@]}"
  exit 1
fi

#!/usr/bin/env bash
# Deploy the built site to the KBG server.
#
#   ./deploy.sh
#
# Ships dist/ to a new timestamped release and atomically swaps the symlink
# that Caddy's root points at, so a deploy is never half-applied.

set -euo pipefail

HOST="${KBG_HOST:-ubuntu@144.24.122.125}"
RELEASES="/var/www/kbgwebsite-releases"
CURRENT="/var/www/kbgwebsite"
KEEP=5

cd "$(dirname "$0")"

echo "▸ building"
npm run build

REL="$(date +%Y%m%d%H%M%S)"
echo "▸ release $REL"

# NOTE: rsync is NOT installed on this server — use tar over ssh.
# COPYFILE_DISABLE stops macOS shipping AppleDouble ._* turds into the webroot.
ssh "$HOST" "sudo mkdir -p $RELEASES/$REL"
COPYFILE_DISABLE=1 tar czf - -C dist . | ssh "$HOST" "sudo tar xzf - -C $RELEASES/$REL"

ssh "$HOST" "
  set -e
  sudo find $RELEASES/$REL -name '._*' -delete
  sudo find $RELEASES/$REL -name '.DS_Store' -delete
  sudo chown -R caddy:caddy $RELEASES/$REL
  sudo find $RELEASES/$REL -type d -exec chmod 755 {} \;
  sudo find $RELEASES/$REL -type f -exec chmod 644 {} \;

  # Sanity-check BEFORE swapping — never point the symlink at an empty release.
  test -f $RELEASES/$REL/index.html || { echo 'FATAL: no index.html; not swapping'; exit 1; }

  # Atomic: ln -sfn then mv -Tf replaces the symlink in one syscall.
  sudo ln -sfn $RELEASES/$REL ${CURRENT}.new
  sudo mv -Tf ${CURRENT}.new $CURRENT

  # keep the last $KEEP releases so a rollback is one symlink away
  cd $RELEASES && ls -1dt */ | tail -n +$((KEEP + 1)) | xargs -r sudo rm -rf
  echo '▸ live:' \$(readlink $CURRENT)
"

echo "▸ verifying"
for p in / /about /team /events /projects; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://144.24.122.125${p}")
  printf '   %-10s %s\n' "$p" "$code"
  [ "$code" = "200" ] || { echo "FAILED on $p"; exit 1; }
done
echo "▸ done"

# Rollback:
#   ssh $HOST "sudo ln -sfn $RELEASES/<older> ${CURRENT}.new && sudo mv -Tf ${CURRENT}.new $CURRENT"

#!/bin/sh
# Installs an `apeiron` command into ~/.local/bin that runs the CLI from this checkout
# with the Node version pinned in mise.toml.
set -eu
REPO="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${APEIRON_BIN_DIR:-$HOME/.local/bin}"
mkdir -p "$BIN"
cat > "$BIN/apeiron" <<SHIM
#!/bin/sh
exec mise exec -C "$REPO" -- node --import "$REPO/node_modules/tsx/dist/loader.mjs" "$REPO/packages/cli/src/index.ts" "\$@"
SHIM
chmod +x "$BIN/apeiron"
echo "Installed $BIN/apeiron"

#!/bin/sh
# Installs an `cherry` command into ~/.local/bin that runs the CLI from this checkout
# with the Node version pinned in mise.toml.
set -eu
REPO="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${CHERRY_BIN_DIR:-$HOME/.local/bin}"
mkdir -p "$BIN"
cat > "$BIN/cherry" <<SHIM
#!/bin/sh
exec mise exec -C "$REPO" -- node --import "$REPO/node_modules/tsx/dist/loader.mjs" "$REPO/packages/cli/src/index.ts" "\$@"
SHIM
chmod +x "$BIN/cherry"
echo "Installed $BIN/cherry"

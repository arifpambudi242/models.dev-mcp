#!/usr/bin/env bash

# Helper script to install models.dev MCP server as a Linux Systemd Service

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
NODE_PATH="$(which node || echo "/usr/bin/node")"
PORT="${PORT:-8001}"
HOST="${HOST:-0.0.0.0}"
SERVICE_NAME="models-dev-mcp"
USER_SERVICE_DIR="$HOME/.config/systemd/user"

echo "🚀 Installing $SERVICE_NAME as Systemd User Service..."
echo "  Project Path: $DIR"
echo "  Node Binary:  $NODE_PATH"
echo "  Port:         $PORT"
echo "  Host:         $HOST"

# Ensure project is built
if [ ! -f "$DIR/dist/index.js" ]; then
    echo "📦 Building project first..."
    cd "$DIR" && npm run build
fi

mkdir -p "$USER_SERVICE_DIR"

SERVICE_FILE="$USER_SERVICE_DIR/$SERVICE_NAME.service"

cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=Models.dev MCP Server (SSE)
After=network.target

[Service]
Type=simple
WorkingDirectory=$DIR
ExecStart=$NODE_PATH $DIR/dist/index.js sse --port $PORT --host $HOST
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
EOF

echo "✅ Created service file at: $SERVICE_FILE"

echo "🔄 Reloading systemd daemon..."
systemctl --user daemon-reload

echo "⚡ Enabling and starting $SERVICE_NAME.service..."
systemctl --user enable --now "$SERVICE_NAME.service"

echo ""
echo "🎉 Service successfully installed and started!"
echo ""
echo "Useful commands:"
echo "  Status:  systemctl --user status $SERVICE_NAME"
echo "  Logs:    journalctl --user -u $SERVICE_NAME -f"
echo "  Restart: systemctl --user restart $SERVICE_NAME"
echo "  Stop:    systemctl --user stop $SERVICE_NAME"

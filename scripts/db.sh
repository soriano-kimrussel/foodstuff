#!/usr/bin/env bash
#
# Local MySQL-compatible server, no root and no system packages.
#
# This project was developed on a machine without Docker or a system MySQL, so
# the database runs from an unpacked MariaDB tarball with its data directory
# inside the repo (.devdb/, gitignored). If you already have MySQL or Docker,
# ignore this script entirely and just point DATABASE_URL at your own server —
# nothing in the app depends on it.
#
# Usage: scripts/db.sh {init|start|stop|status|shell|reset}

set -euo pipefail

MARIADB_HOME="${MARIADB_HOME:-$HOME/.local/share/toolchain/mariadb-11.4.5-linux-systemd-x86_64}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$REPO_ROOT/.devdb/data"
SOCKET="$REPO_ROOT/.devdb/mysql.sock"
PIDFILE="$REPO_ROOT/.devdb/mysql.pid"
LOGFILE="$REPO_ROOT/.devdb/mysql.log"
PORT="${DB_PORT:-3307}"

DB_NAME="${DB_NAME:-foodfacts}"
DB_TEST_NAME="${DB_TEST_NAME:-foodfacts_test}"
DB_USER="${DB_USER:-foodfacts}"
DB_PASSWORD="${DB_PASSWORD:-foodfacts}"

if [ ! -x "$MARIADB_HOME/bin/mariadbd" ]; then
  echo "MariaDB not found at $MARIADB_HOME" >&2
  echo "Set MARIADB_HOME, or use your own MySQL and skip this script." >&2
  exit 1
fi

client() {
  "$MARIADB_HOME/bin/mariadb" --socket="$SOCKET" -u root "$@"
}

is_running() {
  [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null
}

wait_until_ready() {
  for _ in $(seq 1 60); do
    if client -e 'SELECT 1' >/dev/null 2>&1; then return 0; fi
    sleep 0.5
  done
  echo "Server did not become ready. Last log lines:" >&2
  tail -20 "$LOGFILE" >&2
  return 1
}

cmd_init() {
  if [ -d "$DATA_DIR/mysql" ]; then
    echo "Data directory already initialized at $DATA_DIR"
  else
    mkdir -p "$DATA_DIR"
    echo "Initializing data directory..."
    "$MARIADB_HOME/scripts/mariadb-install-db" \
      --basedir="$MARIADB_HOME" \
      --datadir="$DATA_DIR" \
      --auth-root-authentication-method=normal >/dev/null
  fi

  cmd_start

  echo "Creating databases and user..."
  client <<SQL
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS \`$DB_TEST_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'%' IDENTIFIED BY '$DB_PASSWORD';
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'%';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';
GRANT ALL PRIVILEGES ON \`$DB_TEST_NAME\`.* TO '$DB_USER'@'%';
GRANT ALL PRIVILEGES ON \`$DB_TEST_NAME\`.* TO '$DB_USER'@'localhost';
FLUSH PRIVILEGES;
SQL

  echo
  echo "Ready. Connection string for backend/.env:"
  echo "  DATABASE_URL=\"mysql://$DB_USER:$DB_PASSWORD@127.0.0.1:$PORT/$DB_NAME\""
}

cmd_start() {
  if is_running; then
    echo "Already running on port $PORT (pid $(cat "$PIDFILE"))."
    return 0
  fi

  mkdir -p "$(dirname "$SOCKET")"
  echo "Starting MariaDB on port $PORT..."
  "$MARIADB_HOME/bin/mariadbd" \
    --defaults-file=/dev/null \
    --basedir="$MARIADB_HOME" \
    --datadir="$DATA_DIR" \
    --socket="$SOCKET" \
    --port="$PORT" \
    --bind-address=127.0.0.1 \
    --pid-file="$PIDFILE" \
    --skip-name-resolve \
    --log-error="$LOGFILE" \
    >/dev/null 2>&1 &

  wait_until_ready
  echo "Running (pid $(cat "$PIDFILE"))."
}

cmd_stop() {
  if ! is_running; then
    echo "Not running."
    return 0
  fi
  local pid
  pid="$(cat "$PIDFILE")"
  echo "Stopping (pid $pid)..."
  kill "$pid"
  for _ in $(seq 1 60); do
    kill -0 "$pid" 2>/dev/null || { echo "Stopped."; return 0; }
    sleep 0.5
  done
  echo "Did not stop cleanly; sending SIGKILL." >&2
  kill -9 "$pid" 2>/dev/null || true
}

cmd_status() {
  if is_running; then
    echo "Running on port $PORT (pid $(cat "$PIDFILE"))."
  else
    echo "Stopped."
  fi
}

cmd_shell() { client "${@:2}"; }

cmd_reset() {
  cmd_stop
  echo "Deleting $REPO_ROOT/.devdb ..."
  rm -rf "$REPO_ROOT/.devdb"
  cmd_init
}

case "${1:-}" in
  init)   cmd_init ;;
  start)  cmd_start ;;
  stop)   cmd_stop ;;
  status) cmd_status ;;
  shell)  cmd_shell "$@" ;;
  reset)  cmd_reset ;;
  *)
    echo "Usage: scripts/db.sh {init|start|stop|status|shell|reset}" >&2
    exit 1
    ;;
esac

#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"
mode="${1:-}"
if [[ "$mode" != dev && "$mode" != demo && "$mode" != prod ]]; then
  echo 'Usage: bash scripts/compose.sh {dev|demo|prod} <compose command> [args...]' >&2
  exit 2
fi
shift
if [[ $# -eq 0 ]]; then
  echo 'Specify a Compose command, e.g. up -d --build, ps, logs -f api, or config -q.' >&2
  exit 2
fi

args=(-f docker-compose.yml)
if [[ "$mode" == prod ]]; then
  config_env="${COMPOSE_CONFIG_ENV:-.env.production}"
  if [[ ! -f "$config_env" ]]; then
    echo 'Copy .env.production.example to .env.production and fill in credentials and URLs.' >&2
    exit 2
  fi
  if grep -q 'CHANGE_ME' "$config_env"; then
    echo 'Replace all CHANGE_ME values in the production environment file first.' >&2
    exit 2
  fi
  # Pin app environment even if the user's shell has APP_ENV_FILE set.
  export APP_ENV_FILE="$config_env"
  args+=(-f docker-compose.demo.yml -f docker-compose.prod.yml)
else
  # Never let Compose implicitly use the host API's .env for interpolation.
  config_env="${COMPOSE_CONFIG_ENV:-.env.compose}"
  if [[ ! -f "$config_env" ]]; then
    config_env=.env.compose.example
  fi
  if [[ "$mode" == demo ]]; then
    args+=(-f docker-compose.demo.yml)
  fi
fi

# Use the same project when switching dev/demo; stop the old mode first.
# Set COMPOSE_PROJECT_NAME explicitly if you need a different project name.
exec docker compose --env-file "$config_env" "${args[@]}" "$@"

#!/bin/bash

set -e

PORTS=(7100 7101 7102 7103 7104 7105)

for port in "${PORTS[@]}"; do
  dir="/data/${port}"

  mkdir -p "${dir}"

  cat > "${dir}/redis.conf" <<EOF
port ${port}

bind 0.0.0.0
protected-mode no

dir ${dir}

appendonly yes
appendfsync everysec
save ""

cluster-enabled yes
cluster-config-file nodes.conf
cluster-node-timeout 5000

cluster-announce-ip 127.0.0.1
cluster-announce-port ${port}
cluster-announce-bus-port $((port + 10000))

loadmodule /usr/local/lib/redis/modules/redisbloom.so
EOF

  redis-server "${dir}/redis.conf" --daemonize yes
done

sleep 2

if redis-cli -p 7100 cluster info | grep -q "cluster_state:ok"; then
  echo "Existing Redis Cluster configuration recovered."
elif redis-cli -p 7100 cluster info | grep -qE "cluster_known_nodes:[2-9][0-9]*"; then
  # All six Redis processes stopped together. Their persisted nodes.conf files
  # already describe the cluster, but gossip needs a few seconds to clear the
  # old failure state. Creating the cluster again would fail because the nodes
  # are intentionally non-empty.
  for attempt in $(seq 1 20); do
    if redis-cli -p 7100 cluster info | grep -q "cluster_state:ok"; then
      echo "Existing Redis Cluster configuration recovered."
      break
    fi

    if [ "${attempt}" -eq 20 ]; then
      echo "Existing Redis Cluster did not recover in time." >&2
      exit 1
    fi

    sleep 1
  done
else
  redis-cli --cluster create \
    127.0.0.1:7100 \
    127.0.0.1:7101 \
    127.0.0.1:7102 \
    127.0.0.1:7103 \
    127.0.0.1:7104 \
    127.0.0.1:7105 \
    --cluster-replicas 1 \
    --cluster-yes
fi

echo "Redis Cluster started."

tail -f /dev/null

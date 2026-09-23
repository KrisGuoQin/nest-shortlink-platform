
FROM redis:8.10.1

COPY start-cluster.sh /usr/local/bin/start-cluster.sh

RUN chmod +x /usr/local/bin/start-cluster.sh

ENTRYPOINT ["/usr/local/bin/start-cluster.sh"]
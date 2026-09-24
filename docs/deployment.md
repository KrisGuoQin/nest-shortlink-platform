# Docker / Nginx 三种运行模式

## 配置结构

- `docker-compose.yml`：公共服务，单独使用即 dev 模式，不包含 API 容器。
- `docker-compose.demo.yml`：增加可扩容的 `api` 服务，将网关和监控切换到 Docker 网络。
- `docker-compose.prod.yml`：叠加在前两个文件上，固定一个 API，设置资源限制和生产端口。
- `scripts/compose.sh`：统一选择文件和环境变量，所有命令都在仓库根目录执行。
- `nginx/nginx.conf`：官方 Nginx 镜像启动时渲染的模板，不要再直接挂载到 `/etc/nginx/nginx.conf`。

要求 Compose 2.24.4+，因为生产文件用 `!override` / `!reset` 替换端口。使用命令 `docker compose`。
默认镜像版本延续仓库已有版本；网关依赖 Nginx 1.27.3+ 的开源动态 DNS 功能。
本次不涉及 GitHub Actions 或自动上传前端，前端仍独立部署。

## 1. 本地开发

```bash
bash scripts/compose.sh dev up -d --build --wait
SHORT_BASE_URL=http://localhost:8080/r pnpm start:dev
```

Docker 内没有 API；两个 worker 仍在 Docker 运行，初次启动会构建它们与迁移所需的后端镜像。
`--wait` 等待的是容器依赖和 Nginx，不会等待你稍后启动的宿主机 API。
API 没启动时网关返回 502，这是预期行为。

本机 API 的 `.env` 使用宿主机地址：

```dotenv
PORT=3000
DATABASE_URL=postgresql://shortlink:shortlink@localhost:5432/shortlink?schema=public
REDIS_URL=redis://localhost:6379
REDIS_CLUSTER_NODES=127.0.0.1:7100,127.0.0.1:7101,127.0.0.1:7102
RABBITMQ_URL=amqp://shortlink:shortlink@localhost:5672
SHORT_BASE_URL=http://localhost:8080/r
FRONTEND_BASE_URL=http://localhost:5173
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4318/v1/traces
```

保留你的其他 JWT、分享和统计密钥。当前应用已监听 `0.0.0.0:3000`，不要改成只监听回环地址，否则 Linux 上的容器无法访问它。
Nginx / Prometheus 通过 `host.docker.internal:3000` 访问 API；`extra_hosts: host-gateway` 支持 Linux。
如果 Linux 主机防火墙阻止容器访问 3000，应只放行 Docker 网段至该端口，不需要把 API 端口开放到公网。

前端继续 `pnpm dev`；已有 Vite 代理将 `/api` 转发到 `localhost:8080`。
本地支持直接访问 `/health/ready`，也支持 `/api/health/ready`；`/r/<code>` 保持原样转发。
所有 API / worker 启动命令都先用 Node `--import` 加载 OpenTelemetry，再加载 Nest 业务入口；不要直接执行 `node dist/main.js`。
本机常规的 `pnpm start:dev` 已包含链路追踪，`start:otel` 仅作为兼容别名保留。
不要另外启动同一套 analytics/outbox worker，除非有意测试多消费者。

## 2. 本地演示

```bash
API_REPLICAS=3 bash scripts/compose.sh demo up -d --build --wait
```

永久保存副本数量：

```bash
cp .env.compose.example .env.compose
# 将 .env.compose 内的 API_REPLICAS 改成需要的正整数
bash scripts/compose.sh demo up -d --build --wait
```

仅调整数量，不重新构建：

```bash
API_REPLICAS=1 bash scripts/compose.sh demo up -d --wait
API_REPLICAS=3 bash scripts/compose.sh demo up -d --wait
```

Nginx 每约 5 秒重新解析 `api` 的 Docker DNS 地址，自动发现新增、删除和重建的实例。
Prometheus 使用 DNS 发现每个实例，避免只采集负载均衡后的一个随机实例。
不设置固定 `container_name`、固定主机端口或固定 `APP_INSTANCE_ID`；响应头 `x-instance-id` 使用各容器的 hostname。
演示环境还返回 `X-Upstream-Addr`，可用于观察请求分发；生产环境关闭该调试头。

```bash
for i in 1 2 3 4 5 6; do
  curl -fsS http://localhost:8080/health/ready
  echo
done
```

## 3. 生产：2 核 8 GB

```bash
cp .env.production.example .env.production
chmod 600 .env.production
# 编辑密码、密钥、管理员邮箱、SHORT_BASE_URL、FRONTEND_BASE_URL
# 可用 openssl rand -hex 32 生成 URL 安全的独立密码或密钥
bash scripts/compose.sh prod config -q
bash scripts/compose.sh prod up -d --build --wait
```

`.env.production` 同时作为 Compose 变量输入与应用 env_file。示例中的连接字符串自动引用数据库和 RabbitMQ 密码。
启动脚本会拒绝包含 `CHANGE_ME` 的文件。该文件已加入 `.gitignore`，不要提交生产密钥。
本地 `dev/demo` 的 Compose 配置使用 `.env.compose`（缺省用示例），不会误把本机 `.env` 当成 Compose 参数。
容器应用默认读取 `.env.docker`；`APP_ENV_FILE` 可在 `.env.compose` 指定，生产脚本强制使用生产文件。

生产固定 `deploy.replicas: 1`，即使设置 `API_REPLICAS=3` 也仍然是 1 个 API。
不要另加 `--scale api=...`，那是显式覆盖 Compose 的管理命令。
所有基础服务、worker 和观测服务都保留；API 不发布主机端口，只能经 Nginx 访问。

| 服务                                       | 内存上限                         |
| ------------------------------------------ | -------------------------------- |
| API                                        | 768 MiB，Node heap 512 MiB       |
| PostgreSQL                                 | 1024 MiB                         |
| Redis                                      | 256 MiB，数据上限 128 MiB        |
| Redis Cluster（六个进程）                  | 768 MiB，每节点数据上限 64 MiB   |
| RabbitMQ                                   | 768 MiB                          |
| analytics / outbox worker                  | 各 384 MiB，Node heap 各 256 MiB |
| Prometheus                                 | 768 MiB，保留 7 天 / 2 GB        |
| Grafana / Jaeger                           | 各 384 MiB                       |
| OTel Collector                             | 256 MiB，pipeline 有内存限流     |
| Nginx / Alertmanager / PostgreSQL exporter | 各 128 MiB                       |
| Redis exporter                             | 64 MiB                           |
| 一次性 migrate                             | 768 MiB，完成后退出              |

常驻容器上限合计约 6.44 GiB，不代表会预先占满；系统、Docker 和构建也需要内存。
这是初始预算，负载下可用 `docker stats` 查看 OOM 和占用后调整。2 核机器共享 CPU，不做每服务独占核分配。
建议后续由 CI 构建镜像，避免在生产机编译时与业务争抢资源。
Jaeger 使用内存存储，生产环境通过 `JAEGER_MAX_TRACES` 将保留数量限制为 5000 条，并继续受 384 MiB 容器内存上限保护；达到数量上限后旧 trace 会被淘汰，容器重启时历史 trace 仍会全部丢失，不能把它当成持久化审计库。需要按天保留时应改接独立的 OpenSearch 等持久化后端，不建议把它继续塞进这台 2 核 8 GB 主机。

### 生产 OpenTelemetry

运行顺序固定为：`instrumentation.js` → Nest API/worker 入口。Dockerfile 的默认命令和两个 worker 的 Compose 命令都显式使用 `node --import`，因此 HTTP、PostgreSQL、Redis、RabbitMQ 等模块会在自动插桩注册之后加载。不要把 `instrumentation.ts` 改成 `main.ts` 内部的普通 import，也不要在生产 Compose 中用 `command: node dist/main.js` 覆盖镜像默认命令。

三个业务进程使用不同的 `service.name`：`shortlink-api`、`analytics-worker`、`outbox-worker`。预加载模块会使用容器 hostname 生成不同的 `service.instance.id`；`OTEL_RESOURCE_ATTRIBUTES` 标记部署环境与版本，发布新版本时同步修改 `service.version`。

线上默认使用 `parentbased_traceidratio=0.1`：入口请求抽样 10%，下游继续遵守上游采样决定。低流量排障时可临时升为 `1.0`，稳定后根据流量和存储成本降到 `0.01` 或更低。改完 `.env.production` 后重建业务容器：

```bash
bash scripts/compose.sh prod up -d --force-recreate api analytics-worker outbox-worker
```

应用以 OTLP/HTTP 发送 traces 到同机 Collector，不直接连接 Jaeger。OTel SDK 的 metrics/logs exporter 明确关闭，因为本项目指标继续使用 Prometheus，日志继续使用容器 stdout，避免重复采集。应用侧 BatchSpanProcessor 和 Collector 的 batch、内存限流、发送队列及有限重试可吸收短时抖动；Collector/Jaeger 长时间不可用时，队列最终仍会丢弃数据，不能影响主业务可用性。退出时 SDK 会执行 shutdown，Compose 给业务容器保留 30 秒优雅停止时间，用于发送尾批 spans。

生产验证：

```bash
bash scripts/compose.sh prod logs --tail=100 otel-collector api
curl -fsS http://localhost/health/ready
# Jaeger 仅绑定服务器 127.0.0.1；从电脑建立隧道后查看服务 shortlink-api
ssh -L 16686:127.0.0.1:16686 deploy@服务器IP
```

然后打开 `http://localhost:16686`。若看不到低流量请求，先确认采样率，排障期间临时设为 `1.0` 后重建业务容器。

网关默认开放 `80`。可用 `HTTP_BIND` / `HTTP_PORT` 调整，例如已有宿主机 HTTPS 网关时使用 `127.0.0.1:8080`。
当前文件不包含证书或自动 TLS；正式 HTTPS 入口需由已有反向代理/负载均衡或另行配置的 TLS 网关提供。
`SHORT_BASE_URL` 与 `FRONTEND_BASE_URL` 应填写用户最终访问的 HTTPS 地址；示例不是实际域名。
生产 API 使用 secure Cookie，HTTP 仅适合网关调试。

PostgreSQL、Redis、Redis Cluster、AMQP 端口不发布到主机；监控 UI、exporter 和 OTLP 主机端口仅绑定 `127.0.0.1`。
要从电脑访问 Grafana，可建立隧道：

```bash
ssh -L 3001:127.0.0.1:3001 deploy@服务器IP
```

之后打开 `http://localhost:3001`。日志按每容器 `10 MB × 3` 轮转。
Rocky Linux 的 SELinux 保持开启，配置文件 bind mount 使用共享标签 `:z`。

## 模式切换和旧配置迁移

本机同一项目只运行一个模式。切换时使用同一目录/同一 `COMPOSE_PROJECT_NAME`，保持原有命名卷：

```bash
# 例如 demo -> dev；不要加 -v，保留数据库和消息卷
bash scripts/compose.sh demo down --remove-orphans
bash scripts/compose.sh dev up -d --build --wait
SHORT_BASE_URL=http://localhost:8080/r pnpm start:dev
```

第一次从旧 `api-1/api-2/api-3` 配置迁移，也先用上述 `down --remove-orphans` 停止旧项目，移除旧 API 容器。
当前已运行容器不会因编辑配置自动切换模式。不要使用 `down -v` 或 `volume prune`。
RabbitMQ 现在固定 hostname 为 `rabbitmq`，便于后续重建；旧卷若使用随机节点名，应在迁移前处理待消费消息并备份，不能假定旧节点目录会自动被新节点识别。
已有数据库的密码不会因修改 `POSTGRES_PASSWORD` 自动更新；更改密码必须同步处理数据库角色和应用连接字符串。

Redis Cluster 原本单独位于 `infra/redis-cluster`，现在三种模式自动启动。它仍是单机六进程实验集群，并不提供跨主机容灾。
若旧 `redis-cluster-lab` 还占用 7100–7105，先停止旧实验：

```bash
docker compose -f infra/redis-cluster/docker-compose.yml stop
```

旧实验卷保留，新主栈使用自己的 `redis_cluster_data` 卷。缓存由应用重新构建，无需迁移 Bloom 数据。
开发模式对客户端宣布 loopback；演示/生产宣布 `redis-cluster` 主机名，避免向容器错误返回 `127.0.0.1`。
Redis Cluster 使用 noeviction，内存达到上限时拒绝写入并让应用回退，不静默驱逐 Bloom Filter。

## 运维与验证

```bash
bash scripts/compose.sh prod ps
bash scripts/compose.sh prod logs --tail=100 api nginx
bash scripts/compose.sh prod exec nginx nginx -t
bash scripts/compose.sh prod exec prometheus promtool check config /etc/prometheus/prometheus.yml
curl -fsS http://localhost/health/ready
node scripts/check-compose.mjs
```

`check-compose.mjs` 只渲染和断言三套配置，不创建容器或连接数据库，也不输出密钥。
Prisma 构建生成和部署迁移显式指定 `prisma7.config.ts`，迁移成功后 API / workers 才启动。
Prometheus 在 `http://localhost:9090/targets` 显示各 API、worker、数据库、Redis、RabbitMQ 的采集状态。
开发 API 停止时会显示 down；Docker 中没有任何 API DNS 记录时也会触发 API down 告警。

基础设施镜像都在本地时，`up --build` 可利用缓存。若基础镜像下载失败，应单独解决 Docker Registry 连通性。
后续使用 CI 镜像时同时设置 `API_IMAGE`、`MIGRATION_IMAGE`、`REDIS_CLUSTER_IMAGE`；迁移镜像必须来自 Dockerfile 的 `migration` target，不能用 runtime 镜像替代。

参考：[Nginx upstream DNS](https://nginx.org/en/docs/http/ngx_http_upstream_module.html#resolve)、[Prometheus DNS discovery](https://prometheus.io/docs/prometheus/latest/configuration/configuration/#dns_sd_config)。

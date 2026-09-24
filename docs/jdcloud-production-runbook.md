# 京东云 Rocky Linux 9 生产部署手册

本文适用于当前短链项目：

- 云主机：京东云，Rocky Linux 9，2 核 8 GB。
- 后端仓库：`nest-shortlink-platform`。
- 前端仓库：`nest-shortlink-fe`。
- 后端、PostgreSQL、Redis、RabbitMQ、Worker、监控和链路追踪运行在 Docker Compose 中。
- 宿主机 Nginx 是唯一公网入口，监听 `80/443`，提供前端静态文件。
- Docker Nginx 仅监听 `127.0.0.1:8080`，将请求转发给 Docker 中的 API。
- 生产环境固定运行一个 API 容器。2 核 CPU 不代表只能运行两个进程，但本项目的 2 核 8 GB 配置以一个 API 为合理起点。

文中的占位符必须替换：

| 占位符 | 示例 |
| --- | --- |
| `<APP_DOMAIN>` | `short.example.com` |
| `<BACKEND_GIT_URL>` | `git@github.com:your-name/nest-shortlink-platform.git` |
| `<FRONTEND_GIT_URL>` | `git@github.com:your-name/nest-shortlink-fe.git` |
| `<ADMIN_EMAIL>` | `admin@example.com` |
| `<SERVER_IP>` | 京东云公网 IP |

## 一、从 0 开始部署前后端

### 1. 部署架构

```text
浏览器
  │
  ├── https://<APP_DOMAIN>/            前端页面
  ├── https://<APP_DOMAIN>/api/*       API
  └── https://<APP_DOMAIN>/r/*         短链跳转
              │
              ▼
宿主机 Nginx :80/:443
  ├── /              → /var/www/shortlink/current
  ├── /api/          → 127.0.0.1:8080/api/
  └── /r/            → 127.0.0.1:8080/r/
                              │
                              ▼
                    Docker Nginx :8080
                              │
                              ▼
                    Docker API :3000（1 个）
```

这种结构会同时运行两个 Nginx，但不会冲突：宿主机 Nginx 占用公网 `80/443`，Docker Nginx只绑定回环地址 `127.0.0.1:8080`。

### 2. 京东云控制台准备

1. 给域名添加 A 记录，指向云主机公网 IP。
2. 安全组入站只开放：
   - `22/tcp`：建议仅允许自己的固定公网 IP。
   - `80/tcp`：允许公网访问，用于 HTTP 和证书签发。
   - `443/tcp`：允许公网访问 HTTPS。
3. 不要在安全组开放 PostgreSQL、Redis、RabbitMQ、Grafana、Prometheus、Jaeger 或 OTLP 端口。

等待 DNS 生效后检查：

```bash
dig +short <APP_DOMAIN>
```

返回值应为云主机公网 IP。

### 3. 创建部署用户

首次以 `root` 登录服务器：

```bash
id deploy || useradd -m -s /bin/bash deploy
passwd deploy
usermod -aG wheel deploy
```

说明：`passwd deploy` 是给 `deploy` 用户设置登录密码，不是显示密码。更推荐配置 SSH 公钥后关闭密码登录。

把本机公钥复制到服务器：

```bash
ssh-copy-id deploy@<SERVER_IP>
ssh deploy@<SERVER_IP>
```

后续除系统安装和 `/etc` 配置外，都使用 `deploy` 用户。加入 `docker` 组相当于授予接近 root 的权限，只给可信运维用户使用。

### 4. 安装基础软件

```bash
sudo dnf update -y
sudo dnf install -y git curl ca-certificates dnf-plugins-core nginx openssl rsync policycoreutils
sudo systemctl enable --now nginx
```

启用防火墙并只开放 Web 服务：

```bash
sudo systemctl enable --now firewalld
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
sudo firewall-cmd --list-all
```

京东云安全组和系统 firewalld 必须同时允许对应端口。

### 5. 安装 Docker Engine、Buildx 和 Compose

先移除可能冲突的旧软件包；这不会自动删除 `/var/lib/docker` 中已有的数据：

```bash
sudo dnf remove -y \
  docker \
  docker-client \
  docker-client-latest \
  docker-common \
  docker-latest \
  docker-latest-logrotate \
  docker-logrotate \
  docker-engine
```

添加 Docker 官方 CentOS 9 软件源并安装：

```bash
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf install -y \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin
sudo systemctl enable --now docker
```

将部署用户加入 Docker 组，然后重新登录：

```bash
sudo usermod -aG docker deploy
exit
ssh deploy@<SERVER_IP>
```

验证版本：

```bash
docker version
docker buildx version
docker compose version
```

本项目要求 Docker Compose `2.24.4` 或更高版本，因为生产 Compose 使用了 `!override` 和 `!reset`。

#### Docker 官方软件源连接失败

如果出现 `SSL_connect: Connection reset by peer`：

```bash
timedatectl status
curl -Iv https://download.docker.com/linux/centos/docker-ce.repo
```

先检查系统时间、DNS 和京东云出站网络。不要通过关闭 SSL 校验解决。仍无法访问时，在能访问官网的机器下载官方 RPM 后上传安装，或者使用自己信任的软件包镜像。

#### Docker Hub 拉取超时

生产环境最可靠的方案是把项目依赖镜像同步到自己的容器镜像仓库。也可以在 `/etc/docker/daemon.json` 配置自己账号下的可信加速地址：

```json
{
  "registry-mirrors": ["https://<YOUR_TRUSTED_MIRROR>"]
}
```

应用配置：

```bash
sudo systemctl daemon-reload
sudo systemctl restart docker
docker info | sed -n '/Registry Mirrors/,+3p'
```

不要照抄来源不明的公共代理；镜像代理能够看到并替换下载内容。项目中的 Jaeger 镜像已使用 Docker Hub 名称，因此 Docker daemon 的 mirror 可以覆盖它。

### 6. 可选：配置 2 GB Swap

2 核 8 GB 能运行当前栈，但首次同时构建镜像时可能出现瞬时内存压力。没有 Swap 时可以创建 2 GB：

```bash
swapon --show
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

如果 `swapon --show` 已有足够 Swap，不要重复创建。

### 7. 创建目录并拉取代码

```bash
sudo install -d -o deploy -g deploy /opt/shortlink
sudo install -d -o deploy -g deploy /var/www/shortlink/releases
cd /opt/shortlink
git clone <BACKEND_GIT_URL> backend
git clone <FRONTEND_GIT_URL> frontend
```

私有仓库使用 GitHub Deploy Key 或 SSH Key，不要把 Personal Access Token 写进 Git URL、脚本或 Git 历史。

后端目录名决定默认 Compose project 名。首次上线后不要随意把 `/opt/shortlink/backend` 改名，否则 Compose 会认为这是另一套项目并创建另一组数据卷。

### 8. 配置后端生产环境变量

```bash
cd /opt/shortlink/backend
cp .env.production.example .env.production
chmod 600 .env.production
```

分别生成独立密钥，不要让 JWT、分享令牌、统计哈希和数据库共用同一个值：

```bash
openssl rand -hex 32
```

重复执行并保存不同输出，然后编辑：

```bash
vi .env.production
```

至少修改下面这些字段：

```dotenv
POSTGRES_PASSWORD=<独立随机值>
RABBITMQ_PASSWORD=<独立随机值>
GRAFANA_ADMIN_PASSWORD=<独立随机值>

JWT_SECRET=<独立随机值>
JWT_ACCESS_SECRET=<独立随机值>
JWT_REFRESH_SECRET=<独立随机值>
SHARE_ACCESS_SECRET=<独立随机值>
ANALYTICS_IP_HASH_SECRET=<独立随机值>

BOOTSTRAP_ADMIN_EMAIL=<ADMIN_EMAIL>
SHORT_BASE_URL=https://<APP_DOMAIN>/r
FRONTEND_BASE_URL=https://<APP_DOMAIN>

# 宿主机 Nginx 已占用 80，Docker Nginx 必须使用内部端口。
HTTP_BIND=127.0.0.1
HTTP_PORT=8080

# 2 核 8 GB 生产环境固定一个 API。
API_IMAGE=shortlink-api:local
MIGRATION_IMAGE=shortlink-migration:local
REDIS_CLUSTER_IMAGE=shortlink-redis-cluster:local
```

保留示例中的数据库、Redis、RabbitMQ、OpenTelemetry 等容器内部地址。不要把容器中的 `postgres`、`redis` 或 `rabbitmq` 改成 `127.0.0.1`。

检查是否仍有占位符或重复端口配置：

```bash
grep -n 'CHANGE_ME' .env.production
grep -nE '^HTTP_(BIND|PORT)=' .env.production
```

第一条命令应该没有输出；第二条应该只输出：

```text
HTTP_BIND=127.0.0.1
HTTP_PORT=8080
```

渲染并校验 Compose：

```bash
bash scripts/compose.sh prod config -q
```

### 9. 首次启动后端全栈

```bash
cd /opt/shortlink/backend
bash scripts/compose.sh prod up -d --build --wait --wait-timeout 600
```

首次启动会：

1. 构建 runtime 和 migration 镜像。
2. 启动 PostgreSQL。
3. 自动执行 `prisma migrate deploy`。
4. 幂等初始化 `OWNER`、`ADMIN`、`MEMBER` 角色和权限。
5. 在 migration 成功后启动 API 和两个 Worker。
6. 以 `instrumentation.js → Nest 入口` 的顺序启动业务进程，确保 OpenTelemetry 在业务模块前初始化。

查看状态：

```bash
bash scripts/compose.sh prod ps -a
bash scripts/compose.sh prod logs --tail=200 migrate api analytics-worker outbox-worker
```

`migrate` 显示 `Exited (0)` 是正常的；API、Worker、PostgreSQL、Redis、RabbitMQ、监控服务应该处于运行或健康状态。

验证 Docker Nginx 和 API：

```bash
curl -fsS http://127.0.0.1:8080/nginx-health
curl -fsS http://127.0.0.1:8080/health/ready
```

两个命令都成功后再配置公网 Nginx。

### 10. 构建并发布前端

前端生产请求默认使用同源 `/api`，不需要把后端 IP 编译进 JavaScript。可以用 Node 24 Docker 镜像构建，避免在宿主机额外安装 Node：

```bash
cd /opt/shortlink/frontend
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -v "$PWD:/app" \
  -w /app \
  node:24.20-bookworm-slim \
  sh -lc 'npm ci && npm run build'
```

创建一个不可变发布目录，并原子切换 `current` 软链接：

```bash
cd /opt/shortlink/frontend
release_name="$(date +%Y%m%d%H%M%S)"
release_dir="/var/www/shortlink/releases/${release_name}"
mkdir -p "$release_dir"
cp -a dist/. "$release_dir/"
ln -sfn "$release_dir" /var/www/shortlink/current
sudo restorecon -Rv /var/www/shortlink
```

检查：

```bash
test -f /var/www/shortlink/current/index.html
readlink -f /var/www/shortlink/current
```

### 11. 配置宿主机 Nginx

创建 `/etc/nginx/conf.d/shortlink.conf`，先配置 HTTP：

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name <APP_DOMAIN>;

    root /var/www/shortlink/current;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8080/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-Id $request_id;
        proxy_connect_timeout 3s;
        proxy_read_timeout 30s;
    }

    location /r/ {
        proxy_pass http://127.0.0.1:8080/r/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-Id $request_id;
        proxy_connect_timeout 3s;
        proxy_read_timeout 30s;
    }

    location ~* \.(?:js|css|png|jpg|jpeg|gif|svg|ico|webp|woff2?)$ {
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache";
    }
}
```

Rocky Linux 9 默认启用 SELinux。允许宿主机 Nginx连接回环地址上的 Docker Nginx：

```bash
sudo setsebool -P httpd_can_network_connect 1
sudo nginx -t
sudo systemctl reload nginx
```

此时验证 HTTP：

```bash
curl -I http://<APP_DOMAIN>/
curl -fsS http://<APP_DOMAIN>/api/health/ready
```

如果 `ss -ltnp | grep ':80 '` 显示一个 Nginx master 和两个 worker，这是单个宿主机 Nginx 的正常进程模型，不是三套 Nginx。

### 12. 配置 HTTPS

生产环境应使用 HTTPS；应用的生产安全 Cookie 也依赖 HTTPS。Rocky Linux 9 可以从 EPEL 安装 Certbot：

```bash
sudo dnf install -y epel-release
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d <APP_DOMAIN>
```

选择把 HTTP 自动跳转到 HTTPS。验证证书续期：

```bash
sudo certbot renew --dry-run
systemctl list-timers | grep -i certbot
```

最终验证：

```bash
curl -I https://<APP_DOMAIN>/
curl -fsS https://<APP_DOMAIN>/api/health/ready
```

### 13. 首次上线验收

```bash
cd /opt/shortlink/backend
bash scripts/compose.sh prod ps
bash scripts/compose.sh prod logs --tail=100 api analytics-worker outbox-worker otel-collector
docker stats --no-stream
```

在浏览器完成以下流程：

1. 注册并登录。
2. 创建工作空间。
3. 添加成员。
4. 创建 `WORKSPACE` 可见短链。
5. 用成员账号访问。
6. 创建 `maxVisits=1` 的短链，确认第一次成功、第二次提示访问次数已用完。

监控端口只绑定 `127.0.0.1`，通过 SSH 隧道访问：

```bash
ssh \
  -L 3001:127.0.0.1:3001 \
  -L 16686:127.0.0.1:16686 \
  -L 9091:127.0.0.1:9091 \
  deploy@<SERVER_IP>
```

本机浏览器访问：

- Grafana：`http://127.0.0.1:3001`
- Jaeger：`http://127.0.0.1:16686`
- Prometheus：`http://127.0.0.1:9091`

Jaeger 当前是有限内存存储，最多保留 `.env.production` 中 `JAEGER_MAX_TRACES` 指定的数量；达到上限会淘汰旧数据，容器重启会丢失历史 trace。

## 二、已经部署成功后，代码更新再次部署

后端和前端是两个独立仓库，应分别发布。生产服务器不要直接修改 Git 跟踪文件；生产专用密钥只保存在被忽略的 `.env.production`。

### 1. 发布前检查和备份

登录服务器：

```bash
ssh deploy@<SERVER_IP>
```

检查当前服务：

```bash
cd /opt/shortlink/backend
bash scripts/compose.sh prod ps
git status --short
```

如果 `git status --short` 显示源码修改，先停止发布并确认来源。不要在生产服务器执行 `git merge` 来处理长期分叉，也不要用 `git reset --hard` 覆盖不明改动。

数据库发布前备份：

```bash
install -d -m 700 /opt/shortlink/backups
backup_file="/opt/shortlink/backups/shortlink-$(date +%Y%m%d%H%M%S).dump"
bash scripts/compose.sh prod exec -T postgres \
  pg_dump -U shortlink -d shortlink -Fc > "$backup_file"
ls -lh "$backup_file"
```

记录当前后端版本：

```bash
git rev-parse HEAD
```

### 2. 更新并验证后端代码

```bash
cd /opt/shortlink/backend
git fetch --prune origin
git pull --ff-only
git log -1 --oneline
```

`git pull --ff-only` 如果失败，说明服务器分支和远端分叉或有不正确的合并历史。先在开发机解决并推送，不要在生产服务器临时合并。

确认生产环境文件仍存在且没有占位符：

```bash
test -f .env.production
grep -n 'CHANGE_ME' .env.production
grep -nE '^HTTP_(BIND|PORT)=' .env.production
bash scripts/compose.sh prod config -q
```

### 3. 构建后端新镜像

```bash
cd /opt/shortlink/backend
bash scripts/compose.sh prod build api migrate
```

这一步只生成镜像，不切换正在运行的 API。构建失败时，旧服务不受影响。

### 4. 先执行数据库迁移和 RBAC seed

```bash
bash scripts/compose.sh prod up -d --no-deps --force-recreate migrate
bash scripts/compose.sh prod wait migrate
bash scripts/compose.sh prod logs --tail=200 migrate
bash scripts/compose.sh prod ps -a migrate
```

只有 `migrate` 显示 `Exited (0)` 才继续。如果失败，保留旧 API，查看迁移日志并修复问题。

Prisma migration 默认只向前执行，不会自动回滚数据库结构。数据库变更应尽量采用兼容的“先增加、再切换、最后删除”方式。

### 5. 同步更新 API 和 Worker

API、Analytics Worker 和 Outbox Worker 共享同一个 runtime 镜像，必须使用同一版本一起重建。访问次数事件之类的生产者/消费者协议变更尤其不能只更新一端。

```bash
bash scripts/compose.sh prod up -d \
  --no-deps \
  --no-build \
  --force-recreate \
  api analytics-worker outbox-worker
```

确认健康：

```bash
bash scripts/compose.sh prod ps
bash scripts/compose.sh prod logs --tail=150 api analytics-worker outbox-worker
curl -fsS http://127.0.0.1:8080/health/ready
curl -fsS https://<APP_DOMAIN>/api/health/ready
```

如果后端更新包含 `nginx/nginx.conf`、Compose 文件或观测配置，再执行完整收敛：

```bash
bash scripts/compose.sh prod up -d --no-build --remove-orphans
```

不要添加 `-v`，否则会删除数据库、RabbitMQ、Prometheus 和 Grafana 等命名卷。

### 6. 更新并发布前端

```bash
cd /opt/shortlink/frontend
git status --short
git fetch --prune origin
git pull --ff-only
git log -1 --oneline
```

重新构建：

```bash
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -v "$PWD:/app" \
  -w /app \
  node:24.20-bookworm-slim \
  sh -lc 'npm ci && npm run build'
```

发布为新的静态版本：

```bash
release_name="$(date +%Y%m%d%H%M%S)"
release_dir="/var/www/shortlink/releases/${release_name}"
mkdir -p "$release_dir"
cp -a dist/. "$release_dir/"
ln -sfn "$release_dir" /var/www/shortlink/current
sudo restorecon -Rv /var/www/shortlink
```

静态文件通过软链接原子切换，不需要重启 Nginx。验证：

```bash
readlink -f /var/www/shortlink/current
curl -I https://<APP_DOMAIN>/
```

浏览器进行一次强制刷新，并执行登录、创建短链、跳转等冒烟测试。

### 7. 更新后的完整验收

```bash
cd /opt/shortlink/backend
bash scripts/compose.sh prod ps
bash scripts/compose.sh prod logs --since=10m api analytics-worker outbox-worker nginx
docker stats --no-stream
curl -fsS https://<APP_DOMAIN>/api/health/ready
```

重点确认：

- `migrate` 最近一次退出码为 0。
- API 为 healthy。
- Analytics Worker 和 Outbox Worker 没有持续重启。
- 宿主机 Nginx 没有连续出现 `502/504`。
- OTel Collector 不影响业务健康；短暂上报失败可以丢弃 trace，但不能拖垮 API。
- 前端 HTML 是新版本，静态资源没有 404。

## 三、回滚、备份和常见故障

### 1. 前端快速回滚

列出发布目录：

```bash
ls -1dt /var/www/shortlink/releases/*
```

选定确认过的旧目录，然后切换：

```bash
ln -sfn /var/www/shortlink/releases/<OLD_RELEASE> /var/www/shortlink/current
readlink -f /var/www/shortlink/current
```

无需重载 Nginx。确认页面恢复后再调查新版本。

### 2. 后端代码回滚

先找到上一个已知正常提交：

```bash
cd /opt/shortlink/backend
git log --oneline -10
git switch --detach <GOOD_COMMIT_SHA>
```

重新构建并切换 API 与 Worker：

```bash
bash scripts/compose.sh prod build api
bash scripts/compose.sh prod up -d \
  --no-deps \
  --no-build \
  --force-recreate \
  api analytics-worker outbox-worker
curl -fsS https://<APP_DOMAIN>/api/health/ready
```

确认恢复后再回到主分支：

```bash
git switch main
```

代码回滚不会回滚已经执行的数据库 migration。如果旧代码与新数据库结构不兼容，应先发布兼容修复；只有明确理解数据影响时才从备份恢复数据库。

### 3. 数据备份原则

- 定期用 `pg_dump -Fc` 备份 PostgreSQL，并把备份复制到云主机之外。
- `/opt/shortlink/backups` 只是临时本机备份，不具备主机故障容灾能力。
- 不要把 `.env.production`、数据库 dump 或 SSH 私钥提交到 GitHub。
- 不要运行 `docker compose down -v`、`docker volume prune` 或手工删除 `/var/lib/docker`。
- Redis/Redis Cluster 在本项目中主要承担缓存和限流，PostgreSQL 才是核心业务数据来源。

### 4. 端口 80 被占用

检查：

```bash
sudo ss -ltnp | grep ':80 '
docker ps --filter publish=80 --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
```

宿主机 Nginx监听 80 是本手册的预期状态。确保 `.env.production` 为：

```dotenv
HTTP_BIND=127.0.0.1
HTTP_PORT=8080
```

然后：

```bash
bash scripts/compose.sh prod up -d nginx
curl -fsS http://127.0.0.1:8080/nginx-health
```

### 5. Nginx 返回 502

按链路逐层检查：

```bash
curl -fsS http://127.0.0.1:8080/nginx-health
curl -fsS http://127.0.0.1:8080/health/ready
cd /opt/shortlink/backend
bash scripts/compose.sh prod ps
bash scripts/compose.sh prod logs --tail=200 nginx api
sudo ausearch -m AVC -ts recent
```

如果 Docker 内访问正常、宿主机 Nginx 仍然 502，确认：

```bash
getsebool httpd_can_network_connect
sudo setsebool -P httpd_can_network_connect 1
sudo nginx -t
sudo systemctl reload nginx
```

### 6. `Default MEMBER role is not initialized`

说明 migration/RBAC seed 没有成功完成。检查：

```bash
cd /opt/shortlink/backend
bash scripts/compose.sh prod logs --tail=200 migrate
bash scripts/compose.sh prod up -d --no-deps --force-recreate migrate
bash scripts/compose.sh prod ps -a migrate
```

必须看到 `Workspace RBAC seed completed` 且 migrate 退出码为 0。

### 7. 镜像拉取超时

```bash
docker info | sed -n '/Registry Mirrors/,+3p'
curl -Iv https://registry-1.docker.io/v2/
docker pull redis:8-alpine
```

如果云主机无法稳定访问 Docker Hub：

1. 优先将依赖镜像同步至自己的可信镜像仓库。
2. 或配置云账号专属镜像加速地址。
3. 不要通过关闭 TLS 校验解决。
4. 拉取完成后再执行 Compose，Docker 会复用本地镜像。

### 8. 常用运维命令

```bash
cd /opt/shortlink/backend

# 状态
bash scripts/compose.sh prod ps -a

# 最近日志
bash scripts/compose.sh prod logs --tail=200 api nginx

# 持续观察
bash scripts/compose.sh prod logs -f api analytics-worker outbox-worker

# 资源占用
docker stats --no-stream
df -h
free -h

# 检查宿主机 Nginx
sudo nginx -t
sudo systemctl status nginx --no-pager

# 重启单个业务服务
bash scripts/compose.sh prod restart api

# 停止整套服务但保留数据卷
bash scripts/compose.sh prod down

# 重新启动整套服务
bash scripts/compose.sh prod up -d --wait --wait-timeout 300
```

除非明确要永久清空全部环境，否则任何生产命令都不要附带 `-v`。

## 参考资料

- Docker Engine on CentOS：<https://docs.docker.com/engine/install/centos/>
- Docker Compose plugin：<https://docs.docker.com/compose/install/linux/>
- RHEL 9 Nginx 与反向代理：<https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html-single/deploying_web_servers_and_reverse_proxies/index>
- Rocky Linux firewalld：<https://docs.rockylinux.org/guides/security/firewalld-beginners/>
- Rocky Linux 9 Certbot：<https://docs.rockylinux.org/guides/security/generating_ssl_keys_lets_encrypt/>

# ShortLink Platform

企业级短链接分享与权限管理平台

## 短链访问页面

设置 `FRONTEND_BASE_URL` 为前端站点根地址。后端会将需要登录或密码验证的短链引导至前端访问页；公开短链仍由后端直接重定向。

本地开发默认使用 `http://localhost:5173`。Docker 环境变量见 `.env.docker`。

## Docker 运行模式

需要 Docker Engine 和 Compose 2.24.4+（新版本 `docker compose` 也适用）。

| 模式 | API 在哪里运行          | API 数量               | Nginx 入口           |
| ---- | ----------------------- | ---------------------- | -------------------- |
| dev  | 宿主机 `pnpm start:dev` | Docker 中没有 API      | `127.0.0.1:8080`     |
| demo | Docker                  | `API_REPLICAS`，默认 2 | `127.0.0.1:8080`     |
| prod | Docker                  | 固定 1                 | `0.0.0.0:80`，可配置 |

```bash
# 开发：Docker 启动依赖、worker、监控、Nginx，API 在另一终端启动
bash scripts/compose.sh dev up -d --build --wait
SHORT_BASE_URL=http://localhost:8080/r pnpm start:dev

# 演示：可配置 API 副本数
API_REPLICAS=3 bash scripts/compose.sh demo up -d --build --wait

# 生产：先填写 .env.production 中的密码和域名
cp .env.production.example .env.production
bash scripts/compose.sh prod up -d --build --wait
```

三种模式均保留 PostgreSQL、Redis、Redis Cluster、RabbitMQ、两个 worker 和完整监控链路。
这些命令是三种备选模式，不要同时在同一项目运行。切换前执行旧模式的 `down --remove-orphans`，不加 `-v`。
前端仍按现有方式独立运行；本次 Nginx 是 API/短链网关，同时支持 `/api/*` 和原有直接 API 路由。

完整环境设置、切换、生产内存预算和验证见 [部署说明](docs/deployment.md)。

## RabbitMQ

- 登录地址： http://127.0.0.1:15672/
- 账号：shortlink
- 密码：shortlink

## Prometheus

- 登录地址：http://127.0.0.1:9091/
- 账号：不需要
- 密码：不需要

如果是公网可访问的，就需要
1.准备一个 web.yml 文件，里面写入用户名和经过 bcrypt 哈希处理的密码
2.启动容器时，把这个文件挂载进去，并通过 --web.config.file 参数指定它

## Grafana

- 登录地址：http://127.0.0.1:3001/login
- 账号：admin
- 密码：admin

## AlertManager

- 登录地址：http://127.0.0.1:9093
- 账号：不需要
- 密码：不需要

## jaeger

- 登录地址：http://127.0.0.1:16686
- 账号：不需要
- 密码：不需要

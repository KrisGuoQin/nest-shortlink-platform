# ShortLink Platform

企业级短链接分享与权限管理平台

## 短链访问页面

设置 `FRONTEND_BASE_URL` 为前端站点根地址。后端会将需要登录或密码验证的短链引导至前端访问页；公开短链仍由后端直接重定向。

本地开发默认使用 `http://localhost:5173`。Docker 环境变量见 `.env.docker`。

# CWFLY-WEB

CWFLY 模拟飞行社区网站 —— **前端 SPA + 后端 REST API** 双目录仓库。

## 技术栈

| 目录 | 技术 | 说明 |
|---|---|---|
| `frontend/` | Vue 3 + Vite + Pinia + AMap/Mapbox GL + three.js | 社区门户、在线地图、航图、气象、培训、论坛、工单 |
| `backend/` | Node.js + Express + Prisma 7 + MySQL | 认证（JWT/设备指纹）、航班计划、积分、活动、审计 |

## 快速开始

### 后端
```bash
cd backend
cp .env.example .env        # 填入 DATABASE_URL / JWT_SECRET / SMTP 等
npm install
npx prisma generate
npx prisma migrate dev      # 或 npx prisma migrate deploy
npm run dev                 # 默认 3000 端口
```

### 前端
```bash
cd frontend
npm install
npm run dev                 # Vite 开发服务器
npm run build               # 产物在 dist/
```

## 目录结构
```
backend/
  prisma/          数据模型与迁移
  src/routes/      REST 路由（auth/flightplans/weather/tracks/...）
  src/services/    业务服务（OpenAIP、气象、边界、积分等）
  src/middleware/  鉴权、风控、限流
frontend/
  src/views/       页面（OnlineMap、Charts、Replay、Weather、FlightPlan…）
  src/components/  通用组件与布局
  src/utils/       地图/三维/工具
```


### 前端环境变量（构建期）
Mapbox / OpenWeatherMap 等第三方 key 通过 Vite 环境变量注入，真实值不提交：
```bash
cd frontend
cp .env.example .env.production   # 填入 VITE_MAPBOX_TOKEN / VITE_OWM_KEY
npm run build
```

## 线上部署（PM2）
- 后端：`pm2 reload cwfly-api`（**禁止 restart all**，避免全站闪断）
- 前端：`npm run build` 后增量覆盖 `dist/`（保留旧 hashed 资源，避免在线用户 404）
- 环境：Nginx 反代 + MySQL + PM2

## 功能概览
登录/注册（邮箱验证码、OAuth、设备指纹、登录锁定）、飞行计划（官网提交 + FSD 同步 + 锁定）、
在线地图（2D/3D、航迹、管制边界、回放）、航图与机场资料、METAR/TAF 多源、管制排班、
活动、培训与考试、论坛、积分、工单、管理后台、审计日志。
---
## 相关仓库

| 仓库 | 内容 |
|---|---|
| [CWFLY-WEB](https://github.com/yuanshen-123-ui/CWFLY-WEB) | 网站前后端（Vue3 + Express/Prisma） |
| [CWFLY-FSD](https://github.com/yuanshen-123-ui/CWFLY-FSD) | FSD 服务器（Python asyncio，FSD 协议） |
| [CWFLY-ATC](https://github.com/yuanshen-123-ui/CWFLY-ATC) | 管制中心（ATC 席位/雷达/排班） |
| [CWFLY-BOT](https://github.com/yuanshen-123-ui/CWFLY-BOT) | QQ 机器人（OneBot / NapCat） |
| [CWFLY-DOCS](https://github.com/yuanshen-123-ui/CWFLY-DOCS) | 文档站（VitePress） |
| CWFLY-DEPLOY（私有） | 生产部署资产：Nginx 配置、运维脚本、SQL 迁移（私有仓库，不对外公开） | Nginx · Bash · MySQL |

> 本仓库由 CWFLY 主仓库于 2026-10-30 拆分而来，初始提交为当时快照（不含历史）。
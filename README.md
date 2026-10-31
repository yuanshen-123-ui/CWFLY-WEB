# CWFLY-WEB · 模拟飞行社区网站

CWFLY 模拟飞行社区的门户网站：**Vue 3 前端 + Express/Prisma 后端**，覆盖官网展示、在线地图、航图与机场资料、气象查询、飞行计划、管制排班、培训考试、论坛、积分、活动、工单与安全审计。

- 🌐 线上：https://www.cwflysim.cn
- 🗺 关联服务：FSD 连线服务器（[CWFLY-FSD](https://github.com/yuanshen-123-ui/CWFLY-FSD)）、管制中心（[CWFLY-ATC](https://github.com/yuanshen-123-ui/CWFLY-ATC)）、QQ 机器人（[CWFLY-BOT](https://github.com/yuanshen-123-ui/CWFLY-BOT)）

---

## 一、功能矩阵

| 板块 | 主要能力 |
|---|---|
| 门户 / 仪表盘 | 公告、活动报名、连飞状态、个人统计、签到 |
| 在线地图 | AMap 2D + Mapbox GL 3D 地球 + three.js 飞机模型；实时机组/管制、航迹、管制边界、回放页（`/replay`） |
| 航图与机场 | 机场详情、跑道/频率（OpenAIP 兜底）、METAR/TAF 多源查询、航图库 |
| 飞行计划 | 官网提交/编辑、FSD 同步（`syncFsd`）、管制锁定（`locked`）、呼号校验 |
| 培训考试 | 课程、题库、在线考试、成绩与记录 |
| 管制排班 | 席位排班、值班申请、交接 |
| 社区 | 论坛（版块/帖子/回复）、知识库、通知中心 |
| 积分与成就 | 积分流水、成就、排行榜 |
| 活动 | 活动发布、报名、审核 |
| 工单 | 提交/对话式回复/关闭重开 |
| 管理后台 | 用户与权限、审批、内容审核、审计日志、系统配置、IP/设备封禁 |
| 安全 | JWT、设备指纹、Turnstile、登录锁定、限流、审计与安全事件、IP 分组 |

---

## 二、技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3、Vite、Vue Router、Pinia、AMap JSAPI 2.0、Mapbox GL 3D、three.js、Axios |
| 后端 | Node.js、Express 5、Prisma 7 + `@prisma/adapter-mariadb`、MySQL/MariaDB |
| 认证 | JWT（HS512）+ 刷新、bcrypt 口令、设备指纹、Turnstile |
| 外部服务 | OpenAIP（机场频率/跑道）、aviationweather.gov / VATSIM（METAR/TAF）、SMTP |
| 运维 | PM2（`cwfly-api` 集群）、Nginx 反代、Prisma Migrate |

---

## 三、目录结构

```
CWFLY-WEB/
├── backend/
│   ├── server.js              # 入口：Express 装配、中间件、路由挂载、Prisma 初始化
│   ├── prisma/
│   │   ├── schema.prisma      # 46 个数据模型
│   │   └── migrations/        # 迁移（含基线说明 README-BASELINE.md）
│   ├── src/
│   │   ├── routes/            # 24 个业务路由（见下表）
│   │   ├── services/          # OpenAIP、机场站点库、管制边界、METAR 多源等
│   │   ├── middleware/        # 鉴权、风控、限流、Turnstile、设备指纹
│   │   ├── config/            # 配置与密钥轮换
│   │   ├── utils/             # prisma 封装、日志、邮件、限流存储
│   │   └── data/              # 静态数据（机场库等）
│   ├── scripts/               # 运维/导入脚本（机场导入、用户检查等）
│   └── .env.example           # 后端环境变量模板
└── frontend/
    ├── src/
    │   ├── views/             # 页面：admin / airport / auth / flight / forum / points / portal / training …
    │   ├── components/        # 通用组件与布局（AppLayout 等）
    │   ├── utils/             # 地图、three.js 飞机层、socket、表格、主题
    │   ├── api/               # Axios 实例与接口封装
    │   └── router/            # 路由与守卫
    ├── public/                # 静态资源（3D 机模 *.glb、背景图、机场数据）
    └── .env.example           # 前端构建期变量（Mapbox / OWM）
```

### 后端路由一览

| 模块 | 路径前缀 | 说明 |
|---|---|---|
| auth | `/api/auth` | 登录/注册/刷新/找回密码、OAuth |
| verify | `/api/verify` | 邮箱验证码 |
| dashboard | `/api/dashboard` | 仪表盘聚合数据 |
| profile | `/api/profile` | 个人资料、修改密码 |
| flightplans | `/api/flightplans` | 计划 CRUD、FSD 在线快照、管制边界、计划广播 |
| tracks | `/api/tracks` | 航迹回放（会话列表 / 单会话航迹） |
| weather | `/api/weather` | METAR/TAF 多源（AWC + VATSIM + OurAirports 站点库） |
| charts / content | `/api/charts`、`/api/content` | 航图、机场详情（OpenAIP 兜底） |
| controllers | `/api/controllers` | 管制员信息与在线状态 |
| schedule / meetings | `/api/schedule`、`/api/meetings` | 排班与会议 |
| training | `/api/training` | 课程/题库/考试 |
| events | `/api/events` | 活动 |
| forum | `/api/forum` | 版块/帖子/回复 |
| points | `/api/points` | 积分与成就 |
| checkin | `/api/checkin` | 签到 |
| notifications | `/api/notifications` | 通知 |
| tickets | `/api/tickets` | 工单 |
| feedback / survey | `/api/feedback` | 反馈问卷 |
| apply / staff | `/api/apply`、`/api/staff` | 申请与职员 |
| admin | `/api/admin` | 管理后台 |
| security | `/api/security` | 安全事件、封禁、IP 组 |
| audits | `/api/audits` | 审计日志 |

### 数据模型分组（46 个）

- **用户与权限**：`User`、`Role`、`Permission`、`UserChangeApproval`
- **航班与在线**：`FlightPlan`、`FlightTrack`、`FlightPilot`、`FlightController`、`FlightLog`
- **培训**：`TrainingCourse`、`TrainingExam`、`TrainingRecord`
- **社区**：`ForumBoard`、`ForumPost`、`ForumReply`、`KnowledgeBase`、`Notification`、`Announcement`
- **活动/积分**：`Event`、`EventRegistration`、`ActivityReview`、`UserPoint`、`Achievement`、`UserAchievement`
- **排班/申请**：`ControllerSchedule`、`Application`、`ApplicationReply`、`Staff`
- **工单/反馈**：`Ticket`、`TicketReply`、`Feedback`、`CheckInRecord`、`Meeting`
- **安全审计**：`LoginLog`、`LoginAttempt`、`SecurityEvent`、`AuditLog`、`IpBan`、`IpList`、`IpGroup`、`IpGroupMember`、`DeviceBan`、`IpVisit`、`EmailLog`、`EmailCooldown`、`VerificationCode`
- **其他**：`Airport`、`OnlineUser`、`UserFavorite`、`SystemConfig`

---

## 四、环境变量

### backend/.env（复制 `.env.example`）

| 变量 | 必填 | 说明 |
|---|---|---|
| `DATABASE_URL` | ✅ | MySQL 连接串 `mysql://user:pass@host:3306/db` |
| `JWT_SECRET` | ✅ | JWT 签名密钥（建议 64 位随机） |
| `JWT_EXPIRES` | | 访问令牌有效期，默认 `2h` |
| `SMTP_HOST/PORT/USERNAME/PASSWORD/FROM_EMAIL/FROM_NAME` | | 邮件（验证码/通知） |
| `FRONTEND_URL` | | 前端地址（CORS、邮件链接） |
| `CORS_ORIGIN` | | 允许跨域来源，多个用逗号分隔 |
| `OPENAPI_KEY` | | OpenAIP API Key（机场频率/跑道） |
| `DEVICE_FP_SECRET` | | 设备指纹签名密钥 |
| `TURNSTILE_SECRET_KEY` | | Cloudflare Turnstile 密钥 |
| `WEB_SECRET` | | 站点级密钥（内部签名） |

### frontend/.env（构建期，Vite 注入）

| 变量 | 说明 |
|---|---|
| `VITE_MAPBOX_TOKEN` | Mapbox GL 访问令牌（3D 地球需要；**不要提交真实值**） |
| `VITE_OWM_KEY` | OpenWeatherMap Key（降水雷达图层，可选） |

> AMap Key 与安全密钥写在 `src/views/OnlineMap.vue` 顶部常量中（高德 Key 需在控制台配置域名白名单）。

---

## 五、本地开发

```bash
# 后端
cd backend
cp .env.example .env            # 填写 DATABASE_URL / JWT_SECRET / SMTP…
npm install
npx prisma generate
npx prisma migrate dev          # 本地开发迁移；生产用 migrate deploy
npm run dev                     # http://localhost:3000

# 前端（另开终端）
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

### 数据库迁移

- 生产：`npx prisma migrate deploy`（只应用已有迁移）
- 本地：`npx prisma migrate dev --name <含义>`
- 迁移需保持幂等（`IF NOT EXISTS` / `information_schema` 守卫），历史基线见 `migrations/README-BASELINE.md`

---

## 六、构建与部署

```bash
# 前端构建（需要 VITE_MAPBOX_TOKEN 时先配置 .env.production）
cd frontend && npm run build      # 产物 dist/

# 后端（PM2，零停机）
pm2 reload cwfly-api
```

**部署纪律**：

1. **禁止 `pm2 restart all`** —— 会让所有在线机组/管制掉线；后端只用 `pm2 reload cwfly-api`。
2. 前端发布**增量覆盖** `dist/`，**保留旧的 hashed 资源**，否则在线用户会 404。
3. 变更前先备份数据库，Nginx 改完先 `nginx -t` 再 `reload`。

---

## 七、运维与排障

| 现象 | 排查 |
|---|---|
| 接口 401/403 | Token 过期、`CORS_ORIGIN` 不匹配、风控、设备指纹变化 |
| 登录被锁 | 连续失败 5 次锁定 10 分钟（`LoginAttempt`） |
| 数据库连接失败 | `.env` 的 `DATABASE_URL`、MySQL 可达性、连接池上限 |
| 机场详情为空 | OpenAIP Key 失效或 `Airport` 列长度限制（P2000 时检查列类型） |
| 地图不显示 | Mapbox Token 未配置（3D 自动降级 AMap）、AMap 域名白名单 |
| 前端发布后白屏 | 旧 `index.html` 与资源不匹配；检查是否保留旧 hashed 文件 |

---

## 八、安全设计要点

- 口令 bcrypt(cost 12)；JWT 短时效 + 刷新令牌
- 设备指纹 + IP/设备封禁、登录失败锁定、限流（滑动窗口）
- Turnstile 人机验证（注册/登录/找回）
- 审计日志（认证 / 权限 / 内容 / 空中 / 越权与风控 / 管理操作 / 系统 七类事件）
- 敏感配置仅存在于服务器 `.env`，仓库只提交 `.env.example`

---

## 九、相关仓库

| 仓库 | 内容 |
|---|---|
| [CWFLY-FSD](https://github.com/yuanshen-123-ui/CWFLY-FSD) | FSD 连线服务器（Python asyncio） |
| [CWFLY-ATC](https://github.com/yuanshen-123-ui/CWFLY-ATC) | 管制中心 |
| [CWFLY-BOT](https://github.com/yuanshen-123-ui/CWFLY-BOT) | QQ 机器人 |
| [CWFLY-DOCS](https://github.com/yuanshen-123-ui/CWFLY-DOCS) | 文档站 |


---

© CWFLY 模拟飞行社区 · [cwflysim.cn](https://www.cwflysim.cn)

---

## 贡献

欢迎参与！请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)；
提交 PR 即视为同意 [CLA.md](CLA.md)（你保留自己贡献的版权，同时授予项目发起人再许可能力）。

---

## 后端迁移：Node/Express → Python/FastAPI（进行中）

目标：用 `backend-py/`（FastAPI + SQLAlchemy 2.0 async + asyncmy）替换现有 `backend/`（Express + Prisma），
**接口 100% 兼容、前端零改动**；迁移期间两套后端并存，由 Nginx 按路径前缀灰度切流，全部验证通过后才下线 Node。

| 阶段 | 内容 | 状态 |
|---|---|---|
| P0 | 基础设施（JWT 密钥轮换/权限/限流/日志/异常/静态/Alembic baseline） | ✅ 完成 |
| P1 | `/api/auth`（10 端点：登录/注册/续签/改密/找回） | ✅ 完成 |
| P1.5 | `/api/flightplans`（含 FSD 管理口）+ `/api/profile` 上传 | ✅ 完成 |
| P2 | `weather` / `events` / `tickets` / `forum` 等 18 个业务路由 | ✅ 完成（168/168 端点） |
| P3 | `admin`（80 端点）/ `security` / Socket.IO / 定时任务 | ✅ 完成 |
| P4 | Nginx 全量切流 → **生产已切换 Python**（Node 已停止，观察 1 周后删除 `backend/`） | ✅ 2026-10-31 |

详细说明（启动、灰度配置、兼容红线、本地实测结果）见 [backend-py/README.md](backend-py/README.md)。

---
## 许可证

本项目采用 **GNU General Public License v3.0**（GPL-3.0）开源。
完整条款见仓库根目录 [LICENSE](LICENSE)；简单说明：

- 允许自由使用、修改、分发本软件（含商业用途）
- 分发修改版或衍生作品时必须同样以 GPL-3.0 开源，并提供源码
- 不提供任何担保（详见 GPL-3.0 第 15、16 条）

版权归**所有著作人**（项目发起人及所有贡献者）所有。
Copyright (C) 2026 全体著作人（All contributors）

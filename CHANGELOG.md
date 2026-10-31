# 变更日志（CHANGELOG）

本文件记录 CWFLY-WEB 拆分仓（前端为主）的版本与变更。版本号沿用 `frontend/package.json`（当前 `1.0.0`）。

> 说明：仓库自 2026-10-30 从主仓库拆出，因此更早的历史见主仓库。条目按日期倒序，方括号内为 git 短哈希，便于 `git show <hash>` 追溯。

---

## [未发布] — 工程质量改造（进行中）

> 拆分仓独立后的工程质量专项，覆盖前端架构、测试、性能与文档。以下条目在本文档写成时仍处于**未提交的工作区状态**，合入 `main` 后请移入对应日期段。

### 新增
- 质量工具链：`frontend/eslint.config.js`（ESLint 9 flat config + eslint-plugin-vue）、`frontend/vitest.config.js`、`src/utils/__tests__/` 工具函数单测；`.github/workflows/frontend-ci.yml`（Node 20/22 矩阵执行 test / lint / build）
- 基础组件库 `src/components/base/`：`Icon`、`EmptyState`、`Skeleton`、`AppModal`、`UserAvatar`、`UserTag`，并在高频页面替换重复实现
- 主题切换圆形扩散动效（View Transitions API）、`src/styles/motion.css` 动效降级、全局回顶按钮
- 文档体系：重写 `README.md`，新增 `CONTRIBUTING.md`、`CHANGELOG.md`、`docs/ARCHITECTURE.md`、`docs/交接文档.md`、`docs/TESTING.md`

### 重构 / 性能
- 巨型单文件拆分：`views/OnlineMap.vue`（4000+ 行）拆为 `composables/useOnlineMap*.js` + `components/map/*`；`components/layout/AppLayout.vue`（1700+ 行）拆为 `SidebarNav` / `TopBar` 等子组件 + `useAppNav`
- 样式分层：`assets/global.css` 收敛为聚合入口，实际规则迁至 `src/styles/{tokens,base,dark,mobile,forms,a11y,overlays,liquid}.css`
- Vite 分包：`manualChunks` 函数化，`three` / `leaflet` / `charts` / `pdfjs` / `socketio` 各自独立 vendor chunk；公开页非首屏图片补 `loading="lazy"`（优化前后 chunk 对比见 `frontend/docs/performance.md`）

---

## 2026-10-31

### 前端 · 导航与布局
- `feat(nav)` 导航全面对齐参考站：rAF 滑动高亮、收拢图标栏、顶栏面板头、路由预取（prefetch）、危险操作二次确认 [04671cf]
- `feat(nav)` 导航交互重构：滑动高亮 / 手风琴子项 / 错峰子项动画 / 顶部栏布局三段式切换 [a46ba8d]
- `style(sidebar)` 侧边栏对齐参考截图间距与视觉（40px 行高 / 4px 间距 / 12px 圆角 / 品牌蓝纯色选中）[c623654]
- `fix(nav)` 修复切换页面「闪白」：去掉全屏白色 loading 遮罩，改为顶部细进度条 + 延迟显示 [72c3f79]

### 前端 · 表单与认证体验
- `feat(form)` 表单系统对齐 CTYFLY-WEB：全站原生控件组件化，新增 `FormField` / `SelectMenu` / `DatePicker` / `CheckBox` / `SubmitButton`，校验反馈 `useFieldFeedback`（红边 + 摇晃 + 提示滑入）[29b39f4]
- `fix(auth)` 验证码发送提速 + 登录页补充「忘记密码」入口 [808aedb]
- `feat(auth)` 放宽登录保持时长（10 分钟 → **7 天**），token 临期静默续签、活跃窗口外才强制重登 [8e16805]
- `feat` 隐身旁路 PoW 人机验证（Web Worker 手写 SHA-256，无 UI）+ 液态玻璃（Liquid Glass）UI [0262713]
- `feat(pow)` PoW 强制接入验证码 / 注册 / 找回 / 重置四类敏感接口 [cccf0ec]
- `refactor` 全面移除 Cloudflare Turnstile，人机验证统一由本地 PoW 承担（含 CSP 调整）[7541c71]
- `feat` JWT 有效期调整为 6h（前端 Cookie 政策 / 隐私政策文案同步）[aaac48a]
- `feat(frontend)` 重写 Cookie 政策，新增隐私政策、用户协议页 [00a91a0]

### 前端 · 性能
- `perf(frontend)` 首页背景图 PNG 48.3 MB → WebP 0.94 MB（51.5 倍）；首屏关键传输降至约 174 KB [a907eb9]

### 后端 · Python/FastAPI 迁移（已完成）
- `feat(backend)` 引入 Python/FastAPI 后端（P0 + P1-auth），逐步替换 Node/Express [6caaa06]
- `feat(backend)` `/api/flightplans` 11 端点迁移（FSD 管理口 + SimBrief 导入）[80dfe73]
- `feat(backend)` 全量端口完成（**168/168 端点**）+ Socket.IO + 定时任务 [3f74ffb]
- `feat(backend)` 补齐 IP 封禁中间件真实实现（`IpBan` > 白名单 > `IpList` 优先级）[08843a5]
- `docs(backend-py)` 汇总端口期已知差异与缺口（12 项）[74a5907]
- `feat(backend)` lifespan 预热（warmup）+ 实时通道差异文档 [27cfa82]
- `feat(backend)` 生产切换完成（Node 停止，Python 承载 API）[4e956dd] / [0045141]
- `feat!` Node 后端下线，全量切换到 Python/FastAPI 后端 [5b7f24c]
- `fix(backend-py)` 监控忽略 `CancelledError`；RateLimit 建表前先查 `information_schema` [fe564b9]
- `fix(api)` 实现 `/api/controllers` 管制员名单接口（原先为空桩返回 `[]`）[209bbe4]

### 后端 · 性能与稳定性
- `perf(backend)` 性能翻倍：2 worker + Redis（Socket.IO 多 worker 广播 / 天气共享缓存）+ 后台任务分离 + 预热 + Nginx 优化；首屏 12 个并发请求第 1 轮 1769.8 ms → 105.3 ms [43047a1]
- `fix(backend)` CORS / Socket.IO 支持裸域 + 生产注入 `NODE_ENV=production`（修复裸域反复重连）[62cfd50]
- `fix(deploy)` 监控只统计带时间戳的最新日志行，避免 Traceback 续行误报 [2bf0c47]
- `docs(deploy)` 记录 `ddos-hardening.sh` 自愈目标已改为 Python（`:3001`）[5533bc4]

### 机器人 / 运维
- `feat` 机器人「真人管制上下线」播报接入 QQ 群（含 emoji 卡片、去抖/合并策略）[aaac48a] [d3984a7]
- `docs` 补充管制员信息更新（频率 / ATC INFO）播报说明与可调参数 [280361a]

### 文档与版权
- `docs` 新增贡献指南（CONTRIBUTING）与贡献者许可协议（CLA）[90d8b25]
- `docs` 版权说明改为「所有著作人」（保留 GPL-3.0）[f8ebda7]
- `docs` 采用 GNU General Public License v3.0（GPL-3.0）[015de02]

---

## 2026-10-30

### 仓库拆分
- `chore` 初始提交：从 CWFLY 主仓库拆分为独立部署仓（前端 + 后端 + 部署脚本）[2d66f36]
- `docs` 重写详细 README（功能 / 架构 / 配置 / 部署 / 排障 / 相关仓库）[ebe6116]
- `docs` 精简相关仓库导航 [b880d0e]
- `docs` 精简 README 结尾说明 [969b520]

---

## 版本对照

| 版本 | 日期 | 说明 |
|---|---|---|
| `1.0.0`（未打 tag） | 2026-10-31 | 拆分仓当前版本：Python 后端全量承载、导航/表单体系对齐、7 天会话、WebP 背景优化；质量工具链与架构拆分进行中 |

> 后续发布请在 `main` 上打 tag（如 `v1.1.0`）并在此表补一行；发布内容以本文件对应日期段为准。

## 2026-10-31 工程质量改造（质量优先，全员 review）

### 工程基础（P0）
- 新增 **ESLint 9 flat config**（vue essential + 正确性规则）与 **Vitest** 配置，`npm run lint` / `npm run test` 可用
- 新增 **9 个单测文件 / 153 条用例**（jwt、navLayout、tableSort、fieldFeedback、prefetch、timeBg、pow、sanitize、theme），全部通过
- 新增仓库根 **GitHub Actions CI**（Node 20/22：npm ci → test → lint → build）

### 巨型文件拆分（P0）
- `OnlineMap.vue` 4658 → 430 行：拆出 4 个 composable + 4 个 map 子组件/工具（双引擎地图、机场地面图层、机场编辑器、图层切换器、状态条、编辑工具栏）
- `AppLayout.vue` 1863 → 299 行：拆出 `SidebarNav` / `TopBar` + `useAppNav`（导航/布局切换/收拢/高亮/顶栏面板全部保留，样式声明 552 行逐条等价迁移）

### 样式与组件（P1）
- `global.css` 拆为 `styles/{tokens,base,mobile,overlays,liquid,forms}.css` 分层（按原文件连续分段聚合，层叠顺序不变）+ 新增 `a11y.css`
- 新增基础组件：`Icon` / `EmptyState` / `Skeleton` / `AppModal`（焦点陷阱/Esc/滚动锁/aria）/ `UserAvatar` / `UserTag`
- 用户/后台/论坛/积分等 10 个高频页接入空态、骨架屏、统一弹层、头像与身份标签
- 主题切换接入 **View Transitions 圆形扩散**（不支持/`prefers-reduced-motion` 自动降级）；新增回顶按钮与动效降级兜底

### 性能（P2）
- Vite `manualChunks` 拆分重依赖：首屏 entry 254.98→214.01 kB（gzip −13.7%），Charts 页面 chunk −95.4%，pdfjs 独立 vendor 仅 /charts 加载
- 产出 `frontend/docs/performance.md` 基线报告

### 文档（P3）
- 重写 `README.md`、`CONTRIBUTING.md`，新增 `CHANGELOG.md`、`docs/ARCHITECTURE.md`、`docs/交接文档.md`、`docs/TESTING.md`

### 收口（工程质量闭环）

- **ESLint 全站门禁**：`eslint src` 覆盖 149 文件，清理 113 条历史问题（行为等价），仅保留 3 处最小定向豁免
- **单测扩到 13 文件 / 232 用例**：新增地图核心（GCJ-02/图层/配置）、Mapbox 降级决策、在线地图数据轮询、导航权限与高亮 4 组测试
- **Mapbox 3D 令牌缺失优雅降级**：无 token / 401 / invalid access token 时自动回退 2D 高德、3D 入口置灰并提示，只回退一次（会话标记）
- 修复：`@vue/devtools-api` 显式声明（pinia peer，缺失会导致全新安装后构建失败）；`vitest.config.js` include 增加 composables 测试目录

## 2026-10-31 晚 · 功能调整

- **删除「航迹回放」**：移除页面 `views/Replay.vue`、路由 `/replay`、导航「航迹回放」入口与图标注册（后端航迹采样接口保留，如需停用请另行确认）
- **登录提交按钮重做**：矩形按钮提交时形变为圆球 —— 加载中蓝色旋转环、成功绿色对勾、失败红色叉号；不再显示「提交中/提交成功」等文字文案（保留 sr-only 无障碍状态），成功态停留 650ms→950ms 便于看清对勾
- 影响范围：`components/SubmitButton.vue`（登录/注册共用）、`views/auth/Login.vue`

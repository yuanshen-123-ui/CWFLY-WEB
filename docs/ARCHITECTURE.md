# 前端架构说明（ARCHITECTURE）

本文档描述 `frontend/`（Vue 3 + Vite SPA）的实际架构，面向接手维护与二次开发。所有结论均以仓库现状为准；**文件路径索引见第九节**。

- 技术栈与版本：见根 [`README.md`](../README.md) 第二节
- 测试与质量：见 [`TESTING.md`](TESTING.md)
- 运维 / 部署：见 [`交接文档.md`](交接文档.md)

---

## 一、总体结构

单页应用（SPA，`createWebHistory`），无 SSR、无 TypeScript。自上而下分五层：

```
┌─────────────────────────────────────────────────────────────┐
│ 入口层   index.html（主题预置脚本）→ src/main.js（插件/全局注册/会话检查）│
├─────────────────────────────────────────────────────────────┤
│ 外壳层   App.vue（时段背景 / 全局横幅 / PoW / socket 监听）      │
│          ├─ PortalLayout + PortalNavbar   （公开门户，未登录可达）│
│          ├─ AppLayout（TopBar + SidebarNav）（登录后主工作台）   │
│          └─ 独立页（Login / Register / 封禁页…）                │
├─────────────────────────────────────────────────────────────┤
│ 路由层   router/index.js（懒加载路由表 + 登录/权限守卫 + 标题兜底）│
├─────────────────────────────────────────────────────────────┤
│ 业务层   views/*（页面）+ composables/*（组合式逻辑）            │
├─────────────────────────────────────────────────────────────┤
│ 基础层   api/（axios）· store/（Pinia）· utils/（工具）          │
│          components/（通用/表单/布局/基础组件）· styles/（样式）  │
└─────────────────────────────────────────────────────────────┘
```

关键设计取向：

1. **路由级懒加载**：所有页面 `component: () => import(...)`，首屏只加载外壳与当前页。
2. **重型能力按需加载**：3D 地图（three.js + Mapbox GL）只在 `/map`；PDF（pdf.js）只在 `/charts`；地图 SDK 运行时注入 `<script>`（本地 `public/vendor/` 优先、CDN 兜底）。
3. **权限以 JWT 解码结果判定**（`utils/jwt.js`），后端仍做真实校验；localStorage 篡改不能提权。
4. **全局反馈统一**：错误横幅、动作横幅、二次确认、Toast 各自单一入口，页面不重复造轮子。
5. **样式令牌化**：颜色/玻璃/圆角/间距全走 CSS 变量（`styles/tokens.css`），深色主题只覆盖变量。

---

## 二、启动链路

### 1. `index.html`

- 首屏**主题预置**内联脚本：读取 `localStorage.cw_theme`（`auto|light|dark`），`auto` 时按**北京时间 19:00–07:00 为深色**，在 CSS/应用渲染前写入 `<html data-theme="dark|light">`，避免浅色闪屏。逻辑与 `utils/theme.js` 保持一致。
- 静态标题为 `Loading.`（供首页加载动画），实际标题由路由 `afterEach` 或门户页自行设置。
- 挂载点 `<div id="app">`，入口脚本 `/src/main.js`。

### 2. `src/main.js`（应用装配）

| 装配项 | 内容 |
|---|---|
| 插件 | `app.use(router)`、`app.use(pinia)` |
| 全局指令 | `v-sort`（`utils/tableSort.js`，表格点击表头排序） |
| 全局组件 | `ToastBanner` / `ActionBanner` / `PoWCaptcha` / `FormField` / `CheckBox` / `SelectMenu` / `DatePicker` / `SubmitButton` |
| 全局方法 | `this.$banner(...)` 与 `window.showBanner(...)`（`utils/banner.js`） |
| 全局错误兜底 | `app.config.errorHandler` → 红色横幅提示，避免整页白屏 |
| 页面访问上报 | `reportPageView()` 打点 `/api/security/pixel.gif`（设备指纹证据链） |
| 会话活跃 | 点击/键盘/滚动节流 2s 写 `cw_last_active`；`visibilitychange` / `window.focus` 触发 `checkSessionOnVisible()`（7 天活跃窗口判定 + 临期静默续签 `POST /auth/refresh`） |

### 3. `src/App.vue`（根组件）

- **按时段渐变背景**：15 张 WebP（`public/bg-home/`）按北京时间分钟级渐变（逻辑在 `utils/timeBg.js`），支持主题固定图（浅色 `eve_3` / 深色 `nt_4`）、手动→auto 过渡合成层、用户自定义背景（`--custom-bg` CSS 变量 + `cw:custom-bg` 事件）。
- 挂载全局横幅（`ToastBanner` / `ActionBanner`）、隐身 PoW（`PoWCaptcha`，渲染空 DOM）与**回顶按钮** `FloatingButton`（滚动 > 600px 显示，动效降级见 `styles/motion.css`），并引入 `styles/motion.css`（主题扩散过渡与动效层）。
- **实时通道监听**：`getSocket()` 后监听 `online:count`、`online:list`、`connect`（发 `user:online`），每 60s 发 `user:heartbeat` 心跳；在线数据写入 `store/onlineUsers.js`。
- 登录态变化时拉取用户自定义背景（`profileApi.get()`）。

---

## 三、路由系统（`src/router/index.js`）

### 路由表结构

| 分组 | 路径 | 布局 | 说明 |
|---|---|---|---|
| 门户（公开） | `/`、`/about`、`/meetings`、`/controller-public`、`/cookie-policy`、`/privacy-policy`、`/user-agreement` | `PortalLayout` | 未登录可访问，共享门户导航与页脚 |
| 认证 / 错误页 | `/login`、`/register`、`/forgot-password`、`/oauth/authorize`、`/banned`、`/internet-banned` | 无外壳（独立页） | 独立视觉 |
| 主应用（登录后） | `/dashboard`、`/map`、`/flight-plan`、`/charts`、`/replay`、`/events`、`/training`、`/schedule`、`/knowledge`、`/points` … | `AppLayout` | `/` 重定向 `/portal` 时代的兼容入口：主应用 `''` 重定向 `/dashboard` |
| 管理后台 | `/admin/*`（users / permissions / rating / logs / events / tickets / config …） | `AppLayout`（同一外壳，侧栏子路由） | 不跳独立后台 UI |
| 外链路由 | `/forum`、`/forum/board/:id`、`/forum/post/:id`、`/forum/new` | — | `beforeEnter` 直接 `window.open('https://cwforum.org')` 并返回 `/dashboard` |

`meta` 约定：

| 字段 | 作用 |
|---|---|
| `title` | 浏览器标题（`afterEach` 生成 `xx - CWFLY`） |
| `requiredPermission` | 管理后台细分权限（与 JWT `permissions` 逗号列表匹配，如 `user` / `staff` / `controller` / `event` / `ticket` / `flightplan` / `online`） |
| `requiredRating` | 最低 rating（如 12 = 超管专属日志/配置页） |
| `minLevel` | 通用最低 rating 门槛（保留字段） |

### 全局前置守卫 `beforeEach` 判定顺序

1. **无匹配路由**（`to.matched` 为空）：已登录 → `/dashboard`，未登录 → `/login`。
2. **公开页**（`publicPages` 数组，含 `/`、协议页、登录/注册、封禁页）：直接放行；若已登录则顺带刷新活跃时间。
3. **无 token**：受保护页 → `/login`。
4. **token 过期 / 临近过期（<60s）**：
   - 在活跃窗口内（`isWithinActiveWindow()`，默认 7 天）→ `POST /auth/refresh` 续签并覆盖 `cw_token` / `cw_user`；
   - 续签失败或超出窗口 → 清登录态、`showBanner('登录已过期…')`、等横幅动画完再跳 `/login`（`expireAndRedirect`）。
5. **记录活跃时间**（每次成功导航 `touchLastActive()`）。
6. **权限校验**（从 JWT payload 解码 `rating` / `permissions`）：
   - `/admin/*` 整体门槛 `rating >= 8`；`rating >= 11`（管理员）放行全部管理页；
   - 非管理员按 `meta.requiredPermission` 匹配 `permissions`，无权限 → `/dashboard`；
   - `meta.requiredRating` / `meta.minLevel` 不足 → `/dashboard`。

### 其他路由行为

- `afterEach`：设置 `document.title`（首页交给 `PortalHome` 自己的 Loading 动画；登录/注册页固定站点名）。
- 404 兜底：不存在的路由由守卫重定向（不单独渲染 404 页）。
- 路由加载指示：`AppLayout` 监听 `router.beforeEach/afterEach/onError`，**延迟 160ms** 显示顶部 2px 细进度条（命中预取时为瞬时导航，不显示），替代早期的全屏白色遮罩（修复「切换页面闪白」）。

---

## 四、布局与导航系统

### 布局组件

| 组件 | 职责 |
|---|---|
| `components/portal/PortalLayout.vue` | 门户外壳：`PortalNavbar` + `<router-view>` + `CookieConsent` + 页脚（协议链接） |
| `components/portal/PortalNavbar.vue` | 门户顶部导航（Logo / 关于我们下拉 / 公开入口 / 登录注册按钮 / 移动端汉堡菜单） |
| `components/layout/AppLayout.vue` | 登录后骨架：`TopBar` + `SidebarNav` + `router-view`；布局级状态（侧栏⇄顶栏三段式切换、移动端抽屉、侧栏宽度拖拽 `--sidebar-w`）；路由加载条；Escape / resize 下发；退出登录二次确认；挂载时 `profileApi.get()` 刷新用户资料（权限变更刷新即生效） |
| `components/layout/TopBar.vue` | 顶栏：品牌、页面标题、顶栏导航面板、时钟、主题切换、地图设置、通知、用户菜单、移动端菜单按钮 |
| `components/layout/SidebarNav.vue` | 侧栏：主导航分组、账号区、底部用户卡、收拢态图标栏、tooltip、手风琴、rAF 滑动高亮、宽度拖拽手柄 |

### 导航数据与交互

| 模块 | 内容 |
|---|---|
| `utils/nav.js` | **导航唯一事实来源**：`icons`（内联 SVG）、`navGroups`（分组：飞行中心 / 活动中心 / 申请 / 帮助与支持 / 管理后台）、`singleNavItems`（仪表盘）、`accountNavItems`（个人中心）。字段：`path` `label` `icon` `desc` `items` `adminOnly` `requiredPermission` `requiredRating` |
| `utils/navLayout.js` | 布局偏好：`sidebar`（默认）/ `topbar` 两种布局；收拢态 240px ⇄ 68px；**窄屏 < 860px 强制侧栏抽屉**；持久化 `cw_nav_layout` / `cw_nav_collapsed`；导出响应式 `navLayout` / `narrowScreen` / `isCollapsed` / `isTopLayout` |
| `composables/useAppNav.js` | 拆分自原 `AppLayout` 的导航交互：`useNavLayoutSwitch`（布局三段式切换动画）、`useSidebarDrawer`（窄屏抽屉）、`useSidebarResize`（180–400px 拖拽）、`useNavCurrent`（最长前缀高亮匹配）、`useNavAccordion`（手风琴单开）、`useNavHighlight`（rAF 逐帧滑动高亮测量）、`useNavTooltip`、`useTopbarPanel`（顶栏面板定位）；**不直接读写 localStorage** |
| `utils/prefetch.js` | 路由预取：悬停/聚焦菜单项时 `router.resolve()` 后触发对应 chunk 的 `import()`；空闲时（`requestIdleCallback`）批量预取首屏相关路由 |
| `utils/confirm.js` | 轻量二次确认 `confirmDialog({title,message,confirmText})`，返回 `Promise<boolean>`（Escape 取消 / Enter 确认） |

> 约定：新增页面必须同时更新 `utils/nav.js`（否则无入口）与 `router/index.js`（否则直达 403/404），详见 [`CONTRIBUTING.md`](../CONTRIBUTING.md) 第七节。

---

## 五、状态管理

### Pinia（`store/index.js` 创建单例，`main.js` 注册）

| Store | 文件 | 状态 / 方法 |
|---|---|---|
| `user` | `store/user.js` | `token` / `profile`（与 `cw_token` / `cw_user` 同步）；`isLoggedIn` / `isAdmin`（rating ≥ 11）/ `rating` / `fsdLevel` / `permissions`；`hasRating` / `hasPermission` / `hasAnyPermission`；`login`（含新设备二次验证 `needVerify`）/ `applyLogin` / `register` / `logout` / `setProfile` |
| `onlineUsers` | `store/onlineUsers.js` | 在线人数 `count` 与在线列表 `users`（由 App.vue 的 socket 事件写入） |
| `mapSettings` | `store/mapSettings.js` | 地图全局设置：`weatherRadar`（气象雷达开关）、`devTool`（`cursor` / `draw` / `airport-edit` / null），供顶栏齿轮面板与在线地图页共享 |
| `notification` | `store/notification.js` | 站内轻提示队列（`success/error/info/warning`，自动 4s 移除）；注意：全局错误提示实际走 `utils/banner.js` 红横幅 |

### 模块级单例（非 Pinia，直接 `ref` + 函数导出）

| 模块 | 状态 | 说明 |
|---|---|---|
| `utils/theme.js` | `themeMode` | `auto/light/dark`，写 `cw_theme` + `<html data-theme>`；`auto` 按北京时间 19:00–07:00 判定；`scheduleApplyTheme()` 延迟 2s 应用 UI 配色（与背景渐变配合） |
| `utils/navLayout.js` | `navLayout` / `navCollapsed` / `narrowScreen` | 导航布局偏好（见第四节） |
| `utils/banner.js` | `bannerState` | 红横幅可见性/文案/时长/动画 key；`showBanner` / `hideBanner` / `navigateToLoginAfterBanner` |
| `utils/bannerAction.js` | `actionState` | 右侧滑入动作横幅（密码输入 `secret`、确认 `confirm` 等控件） |
| `utils/pow.js` | `powToken`（**内存**） | PoW 令牌，不落 localStorage；`waitForPowToken(2500)` 供请求拦截器静默等待 |

---

## 六、认证、会话与安全

### 会话模型

| 项 | 值 / 行为 |
|---|---|
| 访问令牌 | JWT（后端签发，生产 `JWT_EXPIRES=6h`），前端只解码 payload 不验签 |
| 存储 | `localStorage.cw_token` + `cw_user`（用户资料 JSON，用于首屏展示） |
| 活跃窗口 | `SESS_ACTIVE_WINDOW = 7 天`（`cw_last_active`）；超出即强制重新登录 |
| 活跃刷新 | 用户点击/键盘/滚动（节流 2s）、路由导航、页面重新可见/聚焦 |
| 续签时机 | 路由守卫（剩余 <60s）、页面可见/聚焦检查（剩余 <1h 静默续签）、接口 401（进入活跃窗口才续签，成功后**原请求重放一次**，`_retried` 防死循环） |
| 过期处理 | 清 `cw_token` / `cw_user` / `cw_last_active` → 红横幅「登录已过期,请重新登录!」→ 横幅动画结束跳 `/login` |
| 封禁处理 | 响应 `403` + `code`：`IP_BANNED` / `DEVICE_BANNED` → `/banned`；`INTERNET_BANNED` → `/internet-banned` |

### 人机验证（PoW，全隐身）

- `components/PoWCaptcha.vue`（挂在 `App.vue`，渲染函数返回 `null`，**不渲染任何 DOM**）→ 请求 `/api/captcha/challenge` → 启动 `workers/pow.worker.js`（手写同步 SHA-256，无第三方、无 `crypto.subtle`）算题 → `POST /api/captcha/verify` → 令牌写入 `utils/pow.js` 内存。
- 失败策略全静默：网络/超时（单次 20s）/校验失败 → 3–8s 随机退避重试；令牌约 8 分钟主动续算（后端令牌 10 分钟）。
- 请求拦截器对敏感接口（`/verify/send`、`/auth/login`、`/auth/login-verify`、`/auth/register`、`/auth/forgot-password`、`/auth/reset-password`）自动加 `X-PoW-Token`，无令牌时最多静默等 2.5s。
- 后端紧急开关：API 环境变量 `POW_ENFORCE=0`。

### 其他安全设施

| 模块 | 作用 |
|---|---|
| `utils/deviceFp.js` | 设备指纹：UA/语言/平台/硬件/屏幕/时区/Canvas/WebGL 信号 → FNV-1a 哈希；**模块内存缓存**（不落盘，刷新重算）；请求头 `X-Device-Fp` 注入；`reportPageView()` 打点 `/api/security/pixel.gif` |
| `utils/sanitize.js` | 富文本安全：`escapeHtml` / `renderText`（转义+换行）/ `sanitizeHtml`（DOMPurify，白名单标签与属性，移除 `style` 防 CSS 注入）。**所有 `v-html` 必须经过它** |
| `utils/jwt.js` | token 解码与剩余时间/过期/临期/活跃窗口判定 |
| `utils/tableSort.js` | 纯 DOM 表格排序指令（数值优先、中文 `localeCompare`、跳过空状态行） |
| `utils/tracking.js` | 页面级安全埋点（设备签名 token `cw_device`、`cw_device_fp`、网络信息、路由变化上报等证据链） |
| `router` 守卫 + `api` 拦截器 | 前端权限门槛与 401/403 统一处理（后端为最终裁决） |

---

## 七、数据访问层（`src/api/index.js`）

- 单例 axios：`baseURL: '/api'`、`timeout: 30000`、JSON 请求头。
- **请求拦截器**：注入 `Authorization: Bearer <cw_token>`、`X-Requested-With`、`X-Device-Fp`；敏感接口等待/附加 PoW 头。
- **响应拦截器**：`res => res.data` —— 即调用方拿到的是**响应体 JSON**。后端统一信封：

  ```json
  { "success": true, "message": "", "data": { } }
  ```

  API 封装与页面通常写作 `api.get('/x').then(res => res.data)`（`res` 为信封，`res.data` 为业务数据）；错误分支由拦截器统一 `showBanner` 并 `reject(new Error(message))`。
- 按业务模块导出：`authApi`、`dashboardApi`、`eventsApi`、`checkinApi`、`profileApi`、`weatherApi`、`feedbackApi`、`applyApi`、`staffApi`、`meetingsApi`、`controllersApi`、`adminApi`、`flightplanApi`、`chartApi`、`ticketApi`。
- 页面**禁止**直接 `import axios`；新增接口一律加在对应模块对象里。

---

## 八、表单系统与全局反馈

### 表单控件（`main.js` 全局注册，页面无需 import）

| 组件 | 说明 |
|---|---|
| `FormField` | 字段容器：label、必填 `*`、选填文案、hint、错误提示区（右侧滑入）、`shake` 抖动、`forId` 可访问性 |
| `SelectMenu` | 统一风格下拉，Teleport 到 body、上下自动翻转、Esc/外点关闭、`aria-haspopup/expanded`、已选项打勾 |
| `DatePicker` | 日期/日期时间选择，`v-model` 为 `YYYY-MM-DD` / `YYYY-MM-DDTHH:mm`，Teleport 面板 |
| `CheckBox` | 布尔或数组 `v-model`，`variant: check / switch` |
| `SubmitButton` | 状态机 `idle / loading / success / error`，error 1.2s 后 `emit('settle')` 由父组件复位 |
| `useFieldFeedback`（`utils/fieldFeedback.js`） | `errors` / `shaking` 响应式对象；`fail(field,msg)`（先清抖动下一帧再开，保证重复提交可重播）、`input()`（一改就收起）、`clearAll()`、`hasError()`、`firstErrorField()` |

典型写法：

```vue
<FormField label="账号" required :error="fb.errors.cid" :shake="fb.shaking.cid" for-id="cid">
  <input id="cid" v-model="cid" class="input" @input="fb.input('cid')" />
</FormField>
<SubmitButton :status="status" label="登录" @click="submit" @settle="status='idle'" />
```

样式类（`.field` / `.label` / `.input` / `.btn` 等）由 `styles/forms.css` 与 `styles/base.css` 提供。

### 反馈层

| 通道 | 入口 | 场景 |
|---|---|---|
| 红色横幅 | `utils/banner.js` → `<ToastBanner>` | 全局错误、登录过期（右上滑入 + 进度条收缩） |
| 动作横幅 | `utils/bannerAction.js` → `<ActionBanner>` | 危险操作输入密码/二次确认（右侧滑入，无进度条） |
| 二次确认弹层 | `utils/confirm.js` `confirmDialog()` | 退出登录、删除等 |
| 页内 Toast 队列 | `store/notification.js` | 页面级轻提示（可选） |
| 全局异常兜底 | `main.js` `app.config.errorHandler` | 组件渲染/生命周期异常 → 横幅提示 |

---

## 九、实时通道（Socket.IO）

- 单例封装 `utils/socket.js`：`getSocket()` 懒创建 `io(window.location.origin, { transports: ['websocket','polling'], reconnection: true, auth: cb => cb({ token }) })`；`disconnectSocket()` 可显式断开。
- 握手携带 `cw_token` 供后端鉴权；断线自动重连（2s 间隔、无限次）。
- 当前事件契约（前端侧）：

  | 方向 | 事件 | 说明 |
  |---|---|---|
  | 前端 → 后端 | `user:online` | 连接成功后告知后端本用户上线，触发广播 |
  | 前端 → 后端 | `user:heartbeat` | 每 60s 心跳，防僵尸连接 |
  | 后端 → 前端 | `online:count` | 在线人数 → `store/onlineUsers` |
  | 后端 → 前端 | `online:list` | 在线用户列表 → `store/onlineUsers` |

- **注意**：在线地图的机组/管制数据**不走 socket**，而是页面内定时轮询接口（`components/map/mapCore.js` 中 `REFRESH_INTERVAL = 5000`，5s 刷新一次）；扩展实时功能时请先确认后端 `sockets/` 是否已有对应事件，避免重复造协议。

---

## 十、主题、时段背景与样式体系

### 主题

- `utils/theme.js`：`themeMode`（`auto/light/dark`）、`isDarkTheme()`、`applyTheme()`（写 `<html data-theme>`）、`scheduleApplyTheme(delay=2000)`；`auto` = 北京时间 19:00–07:00 深色。
- **主题切换圆形扩散动效**：`applyThemeWithTransition(x, y)` 基于 View Transitions API 从点击点扩散切换配色；不支持 API 或用户开启 `prefers-reduced-motion` 时直接 `applyTheme()`；并发点击有防抖与令牌保护。关键帧/伪元素样式在 `styles/motion.css`，接口说明见 `utils/theme.js` 顶部注释。
- 首屏由 `index.html` 内联脚本预置，避免闪白；暗色主题变量在 `styles/tokens.css` 的 `html[data-theme='dark']` 块定义，各组件层的暗色覆盖分散在 `styles/base.css` / `styles/liquid.css` / `styles/forms.css`（均为 `global.css` 连续分段）。

### 时段背景

- `utils/timeBg.js`：15 张背景（`public/bg-home/{nt,mn,aft,eve}_*.webp`）按北京时间分钟级线性渐变，返回 `{ curBg, nextBg, fade, preload }`；`getUpcomingBg(10)` 供提前预加载。
- `App.vue`：双图层 cross-fade + 主题固定图 + 手动→auto 过渡合成层 + 自定义背景层（`--custom-bg`），10s 定时推进渐变进度，`requestIdleCallback` 预热图片。

### 样式分层（`src/assets/global.css` 仅作聚合入口）

| 文件 | 内容 |
|---|---|
| `styles/tokens.css` | 设计令牌：颜色（品牌蓝 `--c-primary` 等）、玻璃拟态（`--glass-bg/-border/-blur/-saturate`）、圆角、阴影、间距、字号 |
| `styles/base.css` | reset、排版、公共类（`.card` `.btn` `.input` `.table`、工具类） |
| `styles/tokens.css` | 设计令牌 + 浅/暗主题变量（`@property` 注册、`html[data-theme='dark']`） |
| `styles/mobile.css` | 移动端断点（≤860px）覆盖 |
| `styles/forms.css` | 表单与控件样式（配合 `components/FormField` 等） |
| `styles/overlays.css` | 横幅/弹层/遮罩等覆盖层公共样式 |
| `styles/liquid.css` | 液态玻璃视觉细节 |
| `styles/a11y.css` | `:focus-visible`、`.sr-only`、`prefers-reduced-motion` 降级 |
| `styles/motion.css` | 主题扩散过渡（View Transitions）、动效降级、回顶按钮过渡；**由 `App.vue` 显式 import** |

约定：业务样式写组件 `<style scoped>`；全局只改分层文件；颜色/玻璃参数必须用 CSS 变量。

---

## 十一、重型依赖与懒加载

| 能力 | 依赖 | 加载路径 | 说明 |
|---|---|---|---|
| 在线地图（3D） | `three` + Mapbox GL JS | 路由 `/map` 懒加载 → `views/OnlineMap.vue` → `utils/aircraft3d.js`（静态 import three） | three 由 Vite `manualChunks` 拆为独立 vendor chunk；Mapbox GL 以 `<script>` 运行时注入（`/vendor/mapbox-gl/mapbox-gl.js` 优先，CDN 兜底） |
| 在线地图（2D） | 高德 JSAPI 2.0 | 同上，运行时注入 `https://webapi.amap.com/maps?v=2.0&key=...` | Key/安全码集中在 `components/map/mapCore.js`（`Replay.vue` 另有独立副本） |
| 航迹回放 | 高德 JSAPI | 路由 `/replay` 懒加载 → `views/Replay.vue` | 复用地图 SDK |
| 航图 PDF | `pdfjs-dist` | 路由 `/charts` 懒加载 → `views/Charts.vue`（静态 import） | worker：`/vendor/pdfjs/pdf.worker.min.js` |
| 富文本过滤 | `dompurify` | `utils/sanitize.js`（被需要的页面按需引入 utils） | 体积小，不单独分包 |
| 实时通道 | `socket.io-client` | `utils/socket.js`（App.vue 首屏使用） | 独立 vendor chunk，便于长缓存 |
| 图表 | `chart.js` / `vue-chartjs` | **当前源码未引用** | 已保留分包规则，首次引用即独立 chunk |
| 地图瓦片 | `leaflet` | **当前源码未引用** | 同上 |

Vite 构建（`frontend/vite.config.js`）：

- `resolve.alias: { '@': ./src }`
- `build.chunkSizeWarningLimit: 600`
- `build.rollupOptions.output.manualChunks` 函数：按模块 id 命中 `three` / `leaflet` / `charts` / `pdfjs` / `socketio`（Windows 路径反斜杠已归一化）；未命中返回 `undefined` 交给 Rollup 默认分包，避免 catch-all vendor 破坏路由懒加载粒度。
- 开发代理：`/api`、`/uploads`、`/socket.io`（`ws: true`）→ `http://localhost:3000`（**注意与 Python 后端默认 3001 的差异**，见根 README 第四节）。

---

## 十二、目录与关键文件索引

### 入口与外壳

| 路径 | 作用 |
|---|---|
| `frontend/index.html` | HTML 入口、首屏主题预置、`Loading.` 标题、`#app` |
| `frontend/src/main.js` | 应用装配、全局注册、全局错误兜底、访问上报、会话活跃与续签检查 |
| `frontend/src/App.vue` | 根组件：时段/自定义背景、全局横幅、PoW、socket 监听 |
| `frontend/src/router/index.js` | 路由表、登录/权限守卫、标题兜底 |
| `frontend/src/api/index.js` | axios 实例（拦截器）+ 全部接口封装 |
| `frontend/vite.config.js` | 别名、代理、manualChunks 分包 |
| `frontend/eslint.config.js` | ESLint 9 flat config（含 `TODO(lint-freeze)` 存量豁免） |
| `frontend/vitest.config.js` | 单测配置（node 环境，`src/utils/__tests__/**/*.test.js`） |
| `.github/workflows/frontend-ci.yml` | CI：Node 20/22 × install → test → lint → build |
| `frontend/.env.example` | 构建期环境变量模板（Mapbox / OWM） |

### 布局与导航

| 路径 | 作用 |
|---|---|
| `src/components/layout/AppLayout.vue` | 登录后布局骨架（路由视图、加载条、布局切换、退出） |
| `src/components/layout/TopBar.vue` | 顶栏（品牌/标题/面板/时钟/主题/地图设置/通知/用户菜单） |
| `src/components/layout/SidebarNav.vue` | 侧栏（导航/账号区/用户卡/收拢/tooltip/高亮） |
| `src/components/portal/PortalLayout.vue` | 门户外壳（导航 + 路由视图 + Cookie 同意 + 页脚） |
| `src/components/portal/PortalNavbar.vue` | 门户顶部导航 |
| `src/composables/useAppNav.js` | 导航交互 composables（布局切换/抽屉/拖拽/高亮/手风琴/tooltip/顶栏面板） |
| `src/utils/nav.js` | 导航数据唯一事实来源（分组/图标/权限字段） |
| `src/utils/navLayout.js` | 导航布局偏好与窄屏断点（860px） |
| `src/utils/prefetch.js` | 路由预取 |
| `src/utils/confirm.js` | 二次确认 |

### 基础组件

| 路径 | 作用 |
|---|---|
| `src/components/base/Icon.vue` | 统一图标（复用 `utils/nav.js` 的 SVG 路径，按路由名映射） |
| `src/components/base/EmptyState.vue` | 统一空状态（图标/标题/描述/操作） |
| `src/components/base/Skeleton.vue` | 骨架屏（shimmer 动画 + `prefers-reduced-motion` 降级） |
| `src/components/base/AppModal.vue` | 通用弹窗（Teleport、Esc/遮罩关闭、焦点管理、`aria-modal`） |
| `src/components/base/UserAvatar.vue` | 头像（加载失败回退首字母/默认图） |
| `src/components/base/UserTag.vue` | 身份/等级标签（rating、角色语义色） |
| `src/components/FloatingButton.vue` | 回顶按钮（滚动 > 600px 显示） |
| `src/components/CookieConsent.vue` | Cookie 同意提示（仅门户外壳挂载） |
| `src/components/DesktopPet.vue` · `PetFigure.vue` | 桌宠与其 SVG 渲染器 |

### 状态、会话与安全

| 路径 | 作用 |
|---|---|
| `src/store/index.js` · `user.js` · `onlineUsers.js` · `mapSettings.js` · `notification.js` | Pinia 状态 |
| `src/utils/jwt.js` | JWT 解码 / 过期 / 临期 / 活跃窗口 |
| `src/utils/pow.js` · `src/components/PoWCaptcha.vue` · `src/workers/pow.worker.js` | 隐身 PoW 令牌、组件、求解 Worker |
| `src/utils/deviceFp.js` | 设备指纹与访问打点 |
| `src/utils/sanitize.js` | XSS 过滤（DOM 转义 / DOMPurify） |
| `src/utils/tracking.js` | 页面级安全埋点（设备签名 / 网络信息 / 路由上报） |
| `src/utils/tableSort.js` | 全局 `v-sort` 表格排序指令 |

### 视觉与主题

| 路径 | 作用 |
|---|---|
| `src/utils/theme.js` | 主题模式（auto 按北京时间）与 `<html data-theme>` |
| `src/utils/timeBg.js` | 15 张时段背景的分钟级渐变计算 |
| `src/assets/global.css` | 样式聚合入口（`@import styles/*`） |
| `src/styles/*.css` | 令牌 / 基础 / 深色 / 移动端 / 表单 / 覆盖层 / 液态玻璃 / 无障碍 / 动效 |
| `src/components/FloatingButton.vue` | 回顶按钮（滚动 > 600px 显示，动效降级） |
| `src/components/DesktopPet.vue` · `PetFigure.vue` | 桌宠（localStorage：`cw_pet_*`） |

### 页面（`src/views/`）

| 路径 | 作用 |
|---|---|
| `views/OnlineMap.vue`（约 400 行，已从 4000+ 行拆分） + `components/map/{mapCore.js,MapLayerSwitcher.vue,MapStatusBar.vue,AirportEditToolbar.vue}` + `composables/{useOnlineMapData,useOnlineMapInteraction,useAirportEditor,useAirportGroundLayers}.js` | 在线地图页：地图引擎与图层切换、机组/管制渲染、机场地面图层、机场编辑器（持续回归中） |
| `views/Charts.vue` | 航情查询（气象 / 航图 PDF / 航线） |
| `views/Replay.vue` | 航迹回放 |
| `views/FlightPlan.vue` | 飞行计划（提交 / 编辑 / 共享） |
| `views/Dashboard.vue` · `views/Events.vue` · `views/NetworkFlight.vue` · `views/CheckIn.vue` | 工作台 / 活动 / 连飞 / 签到 |
| `views/Profile.vue` · `views/Points.vue` · `views/portals/` | 个人中心 / 积分（`views/points/`） |
| `views/auth/*` | 登录 / 注册 / 找回密码 / OAuth 授权 |
| `views/portal/*` | 门户首页、关于、会议记录、职员公示、三份协议页 |
| `views/admin/*` | 管理后台全部页面 |
| `views/err/*` · `views/banned/*` | 封禁 / 限制页 |

> 页面清单与路由一一对应；新增页面时同步维护 `router/index.js`、`utils/nav.js` 与本表（见 CONTRIBUTING「新增页面步骤」）。

---

## 十三、localStorage / 持久化键位表

所有键统一 `cw_` 前缀；新增键必须在此表登记。

| 键 | 写入方 | 内容 | 清理时机 |
|---|---|---|---|
| `cw_token` | `store/user.js`、续签逻辑 | JWT 访问令牌 | 登出 / 过期 / 封禁 |
| `cw_user` | `store/user.js` | 用户资料 JSON（展示用，权限以 JWT 为准） | 登出 / 过期 |
| `cw_last_active` | `utils/jwt.js` | 最后活跃时间戳（ms） | 登出 / 过期 |
| `cw_theme` | `utils/theme.js` | `auto` / `light` / `dark` | 用户切换（不清除） |
| `cw_nav_layout` | `utils/navLayout.js` | `topbar`（缺省即 sidebar） | 用户切换 |
| `cw_nav_collapsed` | `utils/navLayout.js` | `1` = 收拢图标栏（缺省展开） | 用户切换 |
| `cw_cookie_consent` | `components/CookieConsent.vue` | Cookie 提示已确认标记 | 用户清除浏览器数据 |
| `cw_device_fp` | `utils/tracking.js` | 设备指纹（兼容旧键） | 用户清除浏览器数据 |
| `cw_device` | `utils/tracking.js` | 服务端签发的设备 token（`{fp,sig,issued}`） | 用户清除浏览器数据 |
| `cw_pet_enabled` / `cw_pet_config` / `cw_pet_phrases` / `cw_pet_pos` | `components/DesktopPet.vue` | 桌宠开关 / 外观配置 / 台词 / 位置 | 用户清除浏览器数据 |

**非 localStorage 的持久化**：

| 载体 | 内容 | 说明 |
|---|---|---|
| PoW 令牌（`utils/pow.js` 模块内存） | `X-PoW-Token` | 页面刷新即失效，重新算题 |
| 设备指纹（`utils/deviceFp.js` 模块内存） | `X-Device-Fp` | 刷新重算，不落盘（隐私考虑） |
| CSS 变量 `--custom-bg` | 用户自定义背景图 URL | 由 `profileApi` 读取后写入 `<html>`，不持久化 |
| URL query | 分享/筛选状态（如 `/flight-plan/share/:shareId`、`?icao=`） | 刷新可复现 |

---

## 十四、已知约束与技术债

| 项 | 说明 / 后续 |
|---|---|
| 单文件巨型页面 | `views/OnlineMap.vue` 已从 4000+ 行拆至约 400 行（`components/map/*` + `composables/useOnlineMap*.js` / `useAirport*.js`），需持续回归 2D/3D、机场编辑、回放；`AppLayout` 已完成拆分（TopBar / SidebarNav / useAppNav） |
| 样式层接入 | `styles/{tokens,base,mobile,overlays,liquid,forms}.css` 由 `assets/global.css` 按顺序聚合（层叠顺序与拆分前一致）；`styles/a11y.css` 与 `styles/motion.css` 分别由 `global.css` / `App.vue` 引入 |
| lint 覆盖不全 | 仅 `src/utils`、`src/composables`、`src/components`（`--max-warnings=0`）；对重构期机械迁移的历史文件有定向 `TODO(lint-freeze)` 豁免（见 `frontend/eslint.config.js`），新代码不在豁免内；`views`（最大体量）尚未纳入，需先批量修告警 |
| 测试覆盖窄 | 仅 `src/utils/__tests__` 工具单测（9 文件 / 153 用例），无组件/页面/路由测试（见 TESTING.md 补测计划） |
| 纯 JS 无类型 | 接口返回结构靠约定（后端信封 `{success,message,data}`），大型重构建议逐步引入 JSDoc typedef |
| 开发代理端口 | `vite.config.js` 代理指向 3000，Python 后端默认 3001（见 README FAQ Q2） |
| SDK Key 硬编码 | 高德 Key/安全码写在源码（`components/map/mapCore.js`、`views/Replay.vue`）；建议后续迁移为环境变量 + 域名白名单 |
| 实时通道窄 | Socket 仅承载在线人数/列表；地图机组走 5s 轮询，高频场景可考虑迁到 socket |
| 论坛已外链 | `/forum*` 路由 `beforeEnter` 跳外部论坛站，`views/forum/*` 为历史遗留页面（未挂路由） |
| 无 SSR / 无 CDN | 纯客户端渲染；首屏依赖服务器 RTT，性能优化以「拆包 + 懒加载 + 长缓存」为主（记录见 `frontend/docs/performance.md`） |

---

## 十五、扩展指引（速查）

| 需求 | 步骤 |
|---|---|
| 新增页面 | 建 `views/<域>/Xxx.vue` → `router/index.js` 懒加载 + `meta.title`（+ 权限 meta）→ `utils/nav.js` 注册入口 → 文档同步（详见 CONTRIBUTING 第七节） |
| 新增接口 | `api/index.js` 对应模块对象加方法 → 页面调用（禁止裸 axios） |
| 新增全局状态 | 优先 Pinia（`store/`）；纯偏好类小状态可仿 `utils/theme.js` 模块单例，并在第六节表格登记 localStorage 键 |
| 新增工具函数 | `utils/` 纯函数 + JSDoc + `utils/__tests__/` 单测（node 环境） |
| 新增样式 | 令牌进 `styles/tokens.css`，规则进对应分层文件；页面局部样式用 scoped |
| 新增重型能力 | 路由级 `import()` 隔离 + 必要时在 `vite.config.js` 的 `manualChunks` 增加 vendor 规则 |
| 新增实时事件 | 与后端 `backend-py/app/sockets/` 对齐事件名 → `App.vue` 或页面订阅 → 本文件第九节更新契约 |

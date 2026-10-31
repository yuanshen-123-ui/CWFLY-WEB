# 前端性能基线报告（Vite 拆包 / 图片懒加载）

> 工作目录：`CWFLY-split/CWFLY-WEB/frontend` ｜ 构建工具：Vite 5.4.21 + Vue 3.4
> 报告生成日期：2026-10 ｜ 执行人：perf-agent（task-6）
> 约束：本次优化**只**改动 `frontend/vite.config.js` 并新增本报告；未改动任何业务源码、未执行 `npm install`、未提交 git。

---

## 1. 结论摘要（先看这里）

1. **首屏 entry 从 254.98 kB 降到 214.01 kB（raw −40.97 kB / −16.1%；gzip 91.79 kB → 79.21 kB，−13.7%）**。
   同时把 `socket.io-client` 拆成独立 `socketio` chunk（41.61 kB / gzip 12.99 kB），它仍由 `index.html` 的 `modulepreload` 加载，因此**首屏总字节基本不变**（+0.25%），收益是长缓存隔离与首屏并行下载。
2. **pdfjs 从 Charts 路由 chunk 中拆出**：`Charts` 页面代码从 **498.60 kB 降到 22.59 kB（−95.4%）**，`pdfjs` 变成独立 475.60 kB vendor chunk，仍只在进入 `/charts` 路由时加载。
3. **three 生态收拢**：`three` chunk 561.31 → 605.10 kB（GLTFLoader 等 `three/examples` 模块从 OnlineMap 页面 chunk 并入），`OnlineMap` 页面 chunk 128.15 → 83.16 kB（−34.7%），**地图路由总载荷 690.92 → 689.71 kB（−0.17%，基本持平）**，但依赖与业务代码边界更清晰。
4. **总体积不变**（raw +807 B / +0.04%，gzip +864 B）——拆包不等于压缩，主要收益是**缓存粒度、并行加载与页面 chunk 瘦身**。
5. `leaflet`、`chart.js`、`vue-chartjs` 已在 `package.json` 中声明，但当前 `src/` 下**没有任何 import**，因此本次不会产出对应 chunk（规则已配置，未来一旦引用即自动独立分包）。
6. 5 个目标页面**均无 `<img>` 标签**（首屏 hero 为 CSS 背景），因此本次没有可安全添加 `loading="lazy"` 的位置，**未做无意义改动**（详见 §8）。
7. 未发现重型库被 `main.js`/`App.vue` 全局 import 的违规情况；`three`、`pdfjs` 均已在路由/组件层引入（详见 §7）。

---

## 2. 测试环境与方法

| 项 | 值 |
| --- | --- |
| Node / Vite | Node 24.x（`npx vite`）/ Vite 5.4.21 |
| 构建命令（优化前） | `npx vite build --outDir .tmp-build-f-before --emptyOutDir` |
| 构建命令（优化后） | `npx vite build --outDir .tmp-build-f-after --emptyOutDir` |
| 体积口径 | `raw` = 文件字节数；`gzip` = zlib level 9 压缩后字节数（与 Vite 输出的 gzip 列同口径） |
| 统计范围 | 两个 `assets/` 目录下全部产物（JS + CSS），共 116 / 118 个文件 |

> 说明：baseline 构建期间其他并行任务（布局/地图/组件拆分）仍在合入页面代码，因此**小页面 chunk 的 ±0.03 kB 级漂移**属于并发编辑噪声，本报告对比只讨论量级 ≥ 1 kB 的关键 chunk；两次构建均只差约 2 分钟，配置差异只有 `manualChunks`。

---

## 3. 优化前 chunk 表（baseline，`manualChunks: { three: ['three'] }`）

Vite 构建输出关键行（原样摘录）：

```
.tmp-build-f-before/assets/index-B5DbmOB3.js     254.21 kB │ gzip:  91.87 kB
.tmp-build-f-before/assets/three-YNQgy1fl.js     561.31 kB │ gzip: 141.36 kB
.tmp-build-f-before/assets/Charts-Csm297_N.js    498.60 kB │ gzip: 148.98 kB
.tmp-build-f-before/assets/OnlineMap-D5ujOQYp.js 128.15 kB │ gzip:  40.73 kB
.tmp-build-f-before/assets/AppLayout-BGlO22HO.js  29.66 kB │ gzip:   9.98 kB
.tmp-build-f-before/assets/sanitize-CPbuTMqI.js   29.20 kB │ gzip:  11.01 kB
✓ built in 9.75s
```

按产品族归类（raw / gzip，字节）：

| 产物 | raw (B) | gzip (B) | 说明 |
| --- | ---: | ---: | --- |
| `index-*.js`（entry） | 254,979 | 91,788 | Vue/Router/Pinia/axios/dompurify 共享运行时 + **socket.io-client 全量** |
| `three-*.js` | 561,310 | 140,838 | 仅 `three` 包主体（`three/examples` 的 GLTFLoader 仍在页面 chunk 中） |
| `Charts-*.js` | 499,145 | 148,535 | 航图页面代码 + **pdfjs-dist 主体** |
| `OnlineMap-*.js` | 129,606 | 40,639 | 在线地图页面代码 + GLTFLoader |
| `AppLayout-*.js` | 30,814 | 9,971 | 主布局（另一任务正在拆分） |
| `sanitize-*.js` | 29,196 | 11,008 | DOMPurify 封装（多路由共享） |
| 其余约 110 个文件 | 437,391 | 161,282 | 路由页面 chunk + CSS |
| **合计（116 文件）** | **1,942,441** | **604,061** | |

**首屏实际加载** = `index.html`（1,196 B / gzip 810）+ `index-*.js` + `index-*.css`（33,948 B / gzip 7,183）= **290,123 B raw / gzip 99,781**。
**重型依赖加载时机**：`three` 仅 `/map` 路由；`Charts`（含 pdfjs）仅 `/charts` 路由。

---

## 4. 优化后 chunk 表（新增 `manualChunks` 函数）

Vite 构建输出关键行（原样摘录）：

```
.tmp-build-f-after/assets/index-cLfs3wsu.js    213.24 kB │ gzip:  79.25 kB
.tmp-build-f-after/assets/socketio-SYmKJpIj.js  41.61 kB │ gzip:  13.03 kB
.tmp-build-f-after/assets/pdfjs-SE7EB-lb.js    475.59 kB │ gzip: 141.68 kB
.tmp-build-f-after/assets/Charts-FMZ-VpMT.js    22.59 kB │ gzip:   7.41 kB
.tmp-build-f-after/assets/three-B6ZtOVU0.js    605.10 kB │ gzip: 153.83 kB
.tmp-build-f-after/assets/OnlineMap-B8RS4xYi.js 83.16 kB │ gzip:  27.43 kB
.tmp-build-f-after/assets/AppLayout-D3_SyhRE.js 29.69 kB │ gzip:  10.00 kB
.tmp-build-f-after/assets/sanitize-CPbuTMqI.js  29.20 kB │ gzip:  11.01 kB
✓ built in 10.96s
```

| 产物 | raw (B) | gzip (B) | 说明 |
| --- | ---: | ---: | --- |
| `index-*.js`（entry） | 214,010 | 79,206 | 不再包含 socket.io-client |
| `socketio-*.js`（新增） | 41,609 | 12,990 | `socket.io-client` 独立 vendor chunk，首屏 `modulepreload` |
| `pdfjs-*.js`（新增） | 475,598 | 141,231 | `pdfjs-dist` 独立 vendor chunk，仅 `/charts` 按需加载 |
| `Charts-*.js` | 23,129 | 7,405 | 页面业务代码，已无 pdfjs |
| `three-*.js` | 605,096 | 153,279 | three 主体 + `three/examples`（GLTFLoader 等） |
| `OnlineMap-*.js` | 84,612 | 27,368 | 页面代码，已无 GLTFLoader |
| `AppLayout-*.js` | 30,845 | 9,990 | 与优化前基本一致（并发编辑噪声） |
| `sanitize-*.js` | 29,196 | 11,008 | 未变 |
| 其余约 110 个文件 | 439,153 | 162,448 | 路由页面 chunk + CSS（并发编辑 + 两处小 chunk） |
| **合计（118 文件）** | **1,943,248** | **604,925** | 与优化前基本持平（+0.04% / +0.14%） |

**首屏实际加载** = `index.html`（1,273 B / gzip 840）+ `index-*.js` + `socketio-*.js` + `index-*.css`（33,948 B / gzip 7,183）= **290,840 B raw / gzip 100,219**（较优化前 +0.25% raw / +0.44% gzip）。

---

## 5. 关键对比表（优化前 → 优化后）

| 指标 | 优化前 raw / gzip | 优化后 raw / gzip | raw 变化 | gzip 变化 |
| --- | ---: | ---: | ---: | ---: |
| 首屏 entry（`index`） | 254,979 / 91,788 | 214,010 / 79,206 | **−40,969（−16.1%）** | **−12,582（−13.7%）** |
| 首屏 JS 载荷（entry + preload 的 vendor） | 254,979 / 91,788 | 255,619 / 92,196 | +640（+0.25%） | +408（+0.44%） |
| 首屏总载荷（含 `index.html` 与 entry CSS） | 290,123 / 99,781 | 290,840 / 100,219 | +717（+0.25%） | +438（+0.44%） |
| `/charts` 路由载荷（页面 + pdfjs） | 499,145 / 148,535 | 498,727 / 148,636 | −418（−0.08%） | +101（+0.07%） |
| 其中 `Charts` 页面 chunk | 499,145 / 148,535 | **23,129 / 7,405** | **−476,016（−95.4%）** | **−141,130（−95.0%）** |
| `/map` 路由载荷（页面 + three） | 690,916 / 181,477 | 689,708 / 180,647 | −1,208（−0.17%） | −830（−0.46%） |
| 其中 `OnlineMap` 页面 chunk | 129,606 / 40,639 | **84,612 / 27,368** | **−44,994（−34.7%）** | **−13,271（−32.7%）** |
| 全站产物合计 | 1,942,441 / 604,061 | 1,943,248 / 604,925 | +807（+0.04%） | +864（+0.14%） |

解读：

- **entry 真正变小了 40.97 kB**（socket.io 被挪到独立 chunk）；因为它带 `modulepreload`，**首屏总下载量并未减少**，但 entry（每次部署都会变 hash）与第三方库（版本不变则 hash 不变）解耦，**发版后老用户可命中 socketio 缓存**。
- **Charts 页面 chunk 缩小 95.4%**：页面代码迭代不再让 475 kB 的 pdfjs 重新下载；pdfjs 只随 `/charts` 路由加载，**不影响首屏**。
- **three + GLTFLoader 归一到同一 chunk**，地图路由总载荷基本不变（−0.17%），但避免了 `three/examples` 与 `three` 主体分处两个 chunk 导致的重复请求/缓存抖动。
- 全站合计基本不变，符合预期：**拆包改善的是加载顺序与缓存命中，不是压缩率**。

---

## 6. `manualChunks` 拆包策略与命中情况

### 6.1 实现（`frontend/vite.config.js`）

采用**函数形式** `manualChunks(id)`，只对「体积大、加载时机可控」的依赖命名分包，**不设置 catch-all `vendor`**：

```js
const VENDOR_GROUPS = [
  { name: 'three', re: /\/node_modules\/three\// },                        // 561 kB
  { name: 'leaflet', re: /\/node_modules\/leaflet\// },                    // 当前未引用
  { name: 'charts', re: /\/node_modules\/(?:chart\.js|vue-chartjs)\// },   // 当前未引用
  { name: 'pdfjs', re: /\/node_modules\/pdfjs-dist\// },                   // 仅 Charts 路由
  { name: 'socketio', re: /\/node_modules\/socket\.io-client\// }          // 首屏需要，便于长缓存
]

function manualChunks(id) {
  if (!id.includes('node_modules')) return undefined
  const normalised = id.replace(/\\/g, '/') // 兼容 Windows 反斜杠
  for (const group of VENDOR_GROUPS) {
    if (group.re.test(normalised)) return group.name
  }
  return undefined // 其余依赖交给 Rollup 默认分包
}
```

设计要点：

1. **合并而非覆盖**：原有 `manualChunks: { three: ['three'] }` 的语义被函数内 `three` 规则完整保留，并扩展为 `three/` 全包（含 `three/examples/jsm/...`）；`alias`、`server.proxy`（含 `ws: true`）、`chunkSizeWarningLimit` 等原有配置均未改动。
2. **不加 catch-all `vendor`**：若把所有 `node_modules` 塞进一个 vendor chunk，会把只被懒加载路由使用的依赖强行拉进首屏请求链，破坏路由级懒加载；因此只命名 5 类重型依赖，其余全部交给 Rollup 按实际引用图默认分包。
3. **不改业务 import**：`three`、`pdfjs`、`socket.io` 的引用位置保持原样，拆包只发生在构建输出层。

### 6.2 命中情况

| 规则 | 是否命中 | 产物 | 加载时机 |
| --- | --- | --- | --- |
| `three` | ✅ 命中 | `three-B6ZtOVU0.js`（605.10 kB / gzip 153.83 kB） | 仅 `/map` 路由（`OnlineMap` → `utils/aircraft3d.js`） |
| `pdfjs` | ✅ 命中 | `pdfjs-SE7EB-lb.js`（475.59 kB / gzip 141.68 kB） | 仅 `/charts` 路由（`Charts.vue`） |
| `socket.io-client` | ✅ 命中 | `socketio-SYmKJpIj.js`（41.61 kB / gzip 13.03 kB） | 首屏（`App.vue` → `utils/socket.js`），`modulepreload` |
| `leaflet` | ⚠️ 未命中 | 无产物 | 当前 `src/` 无 import；规则预置，将来引用即生效 |
| `chart.js` / `vue-chartjs` | ⚠️ 未命中 | 无产物 | 当前 `src/` 无 import；规则预置，将来引用即生效 |

> `index-*.js` 中出现的 `assets/pdfjs-*.js`、`assets/three-*.js` 字符串来自 Vite 为**动态 import 预加载**生成的 `__vite__mapDeps` 映射表，**不是静态 import**，entry 的静态依赖只有 `socketio` chunk（见 `index.html` 的 `modulepreload` 列表）。

### 6.3 构建告警说明

优化后 `three` chunk 605.10 kB 超过 `chunkSizeWarningLimit: 600`，构建会打印一条非致命警告（`Some chunks are larger than 600 kB after minification`）。该 chunk 是**独立的 3D 依赖包、仅地图路由加载**，属预期现象；本次未调高阈值以免掩盖未来的首屏膨胀。若 CI 需要零警告，可把 `chunkSizeWarningLimit` 提到 700（本报告不建议，见 §9）。

---

## 7. 重型库引用位置排查（任务第 4 项）

| 库 | 引用位置 | 是否「全局 import」 | 处理 |
| --- | --- | --- | --- |
| `three` + `three/examples` | `src/utils/aircraft3d.js` | 否：仅被 `OnlineMap.vue`（懒加载路由 `/map`）引用 | 无需改动，已随路由按需加载 |
| `pdfjs-dist` | `src/views/Charts.vue` | 否：`Charts.vue` 本身是懒加载路由 `/charts` | 无需改动，本次拆出独立 vendor chunk |
| `socket.io-client` | `src/utils/socket.js` | 是：`App.vue` 静态调用 `getSocket()` | **按 Lead 要求保留首屏行为**（实时在线人数/心跳需要尽早建连），仅拆 chunk 不改建连时机 |
| `leaflet` / `chart.js` / `vue-chartjs` | 无 | — | 未被引用，规则预置 |

结论：**不存在「重型库被 `main.js`/`App.vue` 直接 import 导致首屏强制加载」的问题**（socket.io 属产品设计需要，非误引入），因此任务第 4 项无需改动业务代码（改动范围也仅限 5 个页面 + vite 配置，没有可用改动点）。

---

## 8. 图片懒加载清单（任务第 3 项）

逐个检查 5 个目标页面的 `<template>`（`grep -i "img"` 命中 0 处）：

| 文件 | `<img>` 数量 | 首屏背景/图 | 处理 |
| --- | ---: | --- | --- |
| `src/views/portal/PortalHome.vue` | 0 | hero 为 CSS 渐变/玻璃背景（`.hero__bg { display: none }`） | 该页无 img，不做改动 |
| `src/views/portal/AboutUs.vue` | 0 | 纯文本 + card 布局 | 该页无 img，不做改动 |
| `src/views/airport/AirportDetail.vue` | 0 | 纯数据表格/卡片 | 该页无 img，不做改动 |
| `src/views/knowledge/KnowledgeBase.vue` | 0 | 纯文本卡片列表 | 该页无 img，不做改动 |
| `src/views/forum/ForumPostDetail.vue` | 0 | 正文通过 `v-html="renderContent(...)"` 渲染（内容来自后端） | 该页模板无 img；`v-html` 动态内容无法用模板属性加 `loading`，如需覆盖应在 `utils/sanitize.js` 的渲染层统一处理（超出本任务允许改动范围，列入 §9 建议） |

未做任何「为凑数而改」的改动；`index.html` 中的 `/logo/logo_transparent.png` 是 `favicon`，不属于页面 `<img>`，且天然不阻塞首屏渲染。

---

## 9. 后续建议（按性价比排序）

1. **压缩：启用构建期 Brotli/gzip 预压缩**。若 nginx 已开 `gzip_static`/`brotli_static`，可产出 `.br`/`.gz` 预压缩文件；`pdfjs`/`three` 两个大 chunk 的传输体积可再降 15%~20%（gzip 141.68 kB 的 pdfjs 用 Brotli 通常约 110 kB）。
2. **按需动态 import pdfjs**：`Charts.vue` 中 `import * as pdfjsLib from 'pdfjs-dist'` 改为「用户首次查看 PDF 航图时 `await import('pdfjs-dist')`」，可让 `/charts` 首屏少下载 475.59 kB（该文件超出本任务允许改动范围，建议后续单列）。
3. **首屏 preload 精修**：`socketio` chunk 目前只在 `index.html` 里 `modulepreload`，可评估改成 `prefetch`（空闲时预取），把首屏关键路径让给 entry + CSS；需实测建连时机是否受影响。
4. **CDN/长缓存**：给 `assets/*` 加 `Cache-Control: public, max-age=31536000, immutable`（Vite 文件名带 hash，可放心长缓存）；`pdfjs`/`three`/`socketio` 这类版本稳定的 vendor chunk 收益最大。
5. **图片资源**：本次 5 页无 `<img>`，但全站仍有 `public/` 静态图与业务页图片；建议统一约定 `loading="lazy" decoding="async"` + 现代格式（AVIF/WebP）+ 响应式 `srcset`，并在 `v-html` 渲染层（`utils/sanitize.js`）为富文本图片补 `loading="lazy"`。
6. **chunk 体积守门**：在 CI 里加一个「entry gzip ≤ 100 kB、pdfjs/three 不得进入首屏静态图」的断言脚本，避免后续把重型库误引入 `main.js`。
7. **地图 3D 资源**：`three` 605 kB 已是单包下限，进一步优化应转向 `GLTFLoader` 模型资源体积（glb 压缩/Draco）与首帧可用性（骨架屏 + 渐进加载）。

---

## 10. 复现方式

```bash
cd frontend

# 优化前（把 vite.config.js 的 manualChunks 还原为 { three: ['three'] }）
npx vite build --outDir .tmp-build-f-before --emptyOutDir

# 优化后（当前配置）
npx vite build --outDir .tmp-build-f-after --emptyOutDir
```

体积统计口径（本次使用的临时脚本，已随临时目录一并删除）：遍历 `outDir/assets/*`，`raw = statSync().size`，`gzip = zlib.gzipSync(buf, { level: 9 }).length`。

> 两个临时构建目录 `.tmp-build-f-before` / `.tmp-build-f-after` 及中间日志已按验收要求删除，未留在仓库中。

---

## 11. 已知限制

- 本次 baseline 与优化后构建**在并行任务（布局/地图/组件拆分/文档）同时进行期间采集**，小页面 chunk 存在 ±0.03 kB 级噪声；关键 vendor chunk（three/pdfjs/socketio/index）不受影响，对比结论稳定。
- 「首屏总载荷」按 `index.html` 当前实际 `modulepreload` 计算，未含字体/接口请求与运行时动态 chunk。
- gzip 数值为本地 zlib level 9 结果，与服务器实际传输体积（是否 Brotli、是否已压缩）可能不同，用于**相对对比**有效。
- 未做真实网络环境（3G/4G、HTTP/1.1 vs HTTP/2）下的 Lighthouse/性能面板测量；如需端到端指标，建议在部署环境跑一次 Lighthouse 并回填本报告。

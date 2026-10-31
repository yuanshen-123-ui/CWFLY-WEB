import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

/**
 * 重型第三方依赖分包策略（manualChunks 函数形式）
 * ---------------------------------------------------------------
 * 只把「体积大、加载时机可控」的依赖拆成独立 vendor chunk，其余第三方依赖
 * 交给 Rollup 默认分包，避免 catch-all vendor 把所有 node_modules 强行塞进
 * 首屏（会破坏路由级懒加载粒度）。命中规则：
 *   three        561KB → 仅 OnlineMap 路由（utils/aircraft3d.js）加载
 *   pdfjs-dist   由 Charts.vue 加载，独立后 Charts 路由 chunk 显著变小
 *   socket.io-client  由 utils/socket.js 引入，App.vue 首屏需要，拆出便于长缓存
 *   leaflet / chart.js + vue-chartjs  当前源码未引用，保留规则保证「一旦引用即独立分包」
 * 之前的 `manualChunks: { three: ['three'] }` 规则已合并进本函数（未删除语义）。
 */
const VENDOR_GROUPS = [
  { name: 'three', re: /\/node_modules\/three\// },
  { name: 'leaflet', re: /\/node_modules\/leaflet\// },
  { name: 'charts', re: /\/node_modules\/(?:chart\.js|vue-chartjs)\// },
  { name: 'pdfjs', re: /\/node_modules\/pdfjs-dist\// },
  { name: 'socketio', re: /\/node_modules\/socket\.io-client\// }
]

/** 按模块 id 命中重型依赖并返回 chunk 名；未命中返回 undefined 走 Rollup 默认分包 */
function manualChunks(id) {
  if (!id.includes('node_modules')) return undefined
  // Windows 下 id 也可能带反斜杠，统一成 posix 路径再匹配
  const normalised = id.replace(/\\/g, '/')
  for (const group of VENDOR_GROUPS) {
    if (group.re.test(normalised)) return group.name
  }
  return undefined
}

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3000', changeOrigin: true },
      // socket.io 实时通信（WebSocket 需 ws:true 才能升级）
      '/socket.io': { target: 'http://localhost:3000', changeOrigin: true, ws: true }
    }
  }
})

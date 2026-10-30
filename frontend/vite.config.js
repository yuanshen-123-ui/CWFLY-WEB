import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

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
        // 手动分包：three 独立成块（仅在线地图页动态加载）
        manualChunks: {
          three: ['three']
        }
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

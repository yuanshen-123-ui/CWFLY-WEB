/**
 * Vitest 配置 —— CWFLY 前端单元测试
 *
 * - 默认环境 node（utils 都是纯逻辑，跑得最快）；
 * - 需要 DOM / localStorage / MutationObserver 的用例，在测试文件首行用
 *   `// @vitest-environment jsdom` 单独切换（jsdom@25 已在 devDependencies）；
 * - include 限定到两个 __tests__ 目录下的 *.test.js，避免误跑其它目录：
 *   src/utils/__tests__（纯工具逻辑）与 src/composables/__tests__（组合式函数）。
 */
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // 与 vite.config.js 保持一致的 @ -> src 别名（prefetch.js 依赖 @/router）
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/utils/__tests__/**/*.test.js', 'src/composables/__tests__/**/*.test.js'],
    reporters: 'default',
    clearMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
  },
})

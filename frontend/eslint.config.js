/**
 * ESLint 9 flat config —— CWFLY 前端
 *
 * 设计策略（质量优先 + 可落地）：
 * 1. 基线用 @eslint/js recommended + eslint-plugin-vue 的 vue3-essential（真实缺陷级规则），
 *    再手工叠加一批「无排版噪音」的 vue3 正确性规则（props 类型、v-if/v-for 混用、模板变量遮蔽等）。
 * 2. 不启用 max-attributes-per-line / html-indent / html-self-closing 等纯排版规则：
 *    既有组件历史上会产生 800+ 条纯格式告警，改造需动业务源码且会和日常提交冲突。
 *    格式化交给编辑器/Prettier，ESLint 只守正确性 —— 因此新代码从第一天起就是 0 error 0 warning。
 * 3. 存量豁免采用「按文件精确 override + TODO(lint-freeze) 注释」，不做全局放宽：
 *    门禁已覆盖 src 全量（含 views/router/store/api/workers/App.vue/main.js），
 *    存量问题已按「行为等价」清理；仅剩两个并行写域中的文件保留最小定向豁免，
 *    CDN 注入的全局对象用 globals 声明而不是关闭 no-undef。
 * 4. 测试文件显式 import { describe, it, expect, vi } from 'vitest'，不注入测试全局。
 */
import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

/** 需要忽略的产物/依赖目录 */
const IGNORES = [
  'dist/**',
  'node_modules/**',
  'coverage/**',
  '.tmp-build-a/**',
  'public/**',
  '*.min.js',
]

/** 源码语言环境：浏览器 + Node（vite 配置、脚本类文件） */
const LANGUAGE_OPTIONS = {
  ecmaVersion: 'latest',
  sourceType: 'module',
  globals: {
    ...globals.browser,
    ...globals.node,
  },
}

/** 正确性规则（在 essential 之上叠加，均经过现有代码验证） */
const CORRECTNESS_RULES = {
  // 单文件组件命名历史上是 FormField/CheckBox/DatePicker 这类单/双词混合，保留现状
  'vue/multi-word-component-names': 'off',
  // 未使用变量按错误级拦截（忽略 _ 前缀占位参数，也不被 catch 变量噪音淹没）
  'no-unused-vars': [
    'error',
    {
      vars: 'all',
      args: 'after-used',
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrors: 'none',
      ignoreRestSiblings: true,
    },
  ],
  'no-var': 'error',
  'prefer-const': 'error',
  eqeqeq: ['error', 'smart'],
  'no-duplicate-imports': 'error',

  // 以下为 eslint-plugin-vue strongly-recommended 中「只查正确性、不查排版」的规则
  'vue/no-template-shadow': 'error',
  'vue/require-prop-types': 'error',
  'vue/require-default-prop': 'error',
  'vue/attribute-hyphenation': 'error',
  'vue/v-bind-style': 'error',
  'vue/v-on-style': 'error',
  'vue/component-definition-name-casing': 'error',
  'vue/no-use-v-if-with-v-for': 'error',
  'vue/no-mutating-props': 'error',
  'vue/no-reserved-component-names': 'error',
  'vue/no-async-in-computed-properties': 'error',
}

export default [
  { ignores: IGNORES },
  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    files: ['**/*.{js,mjs,cjs,vue}'],
    languageOptions: LANGUAGE_OPTIONS,
    rules: CORRECTNESS_RULES,
  },

  // ===== 存量豁免（先堵新问题）=====
  // 高德/Mapbox 是 CDN 注入的全局对象，用 globals 声明而不是关闭 no-undef。
  {
    files: [
      'src/composables/useAirportEditor.js',
      'src/composables/useAirportGroundLayers.js',
      'src/composables/useOnlineMapInteraction.js',
    ],
    languageOptions: {
      globals: {
        AMap: 'readonly',
        mapboxgl: 'readonly',
      },
    },
  },

  {
    // TODO(lint-freeze): useOnlineMapInteraction.js 位于并行地图拆分的写域（map-agent 正在编辑），
    // 本任务不触碰该文件；其存量 no-empty/no-unused-vars 由该写域收口后删除本条。
    files: ['src/composables/useOnlineMapInteraction.js'],
    rules: {
      'no-empty': 'off',
      'no-unused-vars': 'off',
    },
  },

  {
    // TODO(lint-freeze): mapCore.js 是从 OnlineMap.vue 抽出的地图核心逻辑，含历史大整数常量
    // （GCJ-02 椭球系数等），保留 no-loss-of-precision 定向关闭；其余规则已全部通过。
    files: ['src/components/map/mapCore.js'],
    rules: {
      'no-loss-of-precision': 'off',
    },
  },
]

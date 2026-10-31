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
 *    - 重构期间从 OnlineMap.vue / AppLayout.vue 机械迁移出来的历史代码（逻辑未改）；
 *    - 重构前就已存在的历史文件。
 *    新写的 base 组件、layout/map 子组件、composables 与全部 utils 均不在豁免范围。
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
  // TODO(lint-freeze): 重构期从 OnlineMap.vue 机械迁移出来的 composables，
  // 迁移只搬位置、不改逻辑，因此把随迁移带过来的历史规则问题做定向关闭；
  // 高德/Mapbox 是 CDN 注入的全局对象，用 globals 声明而不是关闭 no-undef。
  // 冻结后已复评：useOnlineMapData.js 已迁移干净、TopBar.vue 已把 v-html 移入
  // 原生 <span>（不再触发 no-v-text-v-html-on-component），两者均不在本段豁免。
  // 剩余 3 个 composables 的清理由 Lead 决定，清理后删除本段。
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
    rules: {
      'no-empty': 'off',
      'no-unused-vars': 'off',
      'prefer-const': 'off',
    },
  },

  {
    // TODO(lint-freeze): mapCore.js 是从 OnlineMap.vue 抽出的地图核心逻辑（历史大整数常量）。
    files: ['src/components/map/mapCore.js'],
    rules: {
      'no-loss-of-precision': 'off',
      'no-unused-vars': 'off',
      'prefer-const': 'off',
    },
  },

  {
    // TODO(lint-freeze): legacy file migrated from earlier refactor
    // aircraft3d.js 是重构前就存在的 Mapbox 3D 机队历史代码（不是本轮新增），
    // 存量未使用变量/可 const 化在本次质量任务中不清理（禁止修改业务源码）。
    // 仅定向关闭这两条最小规则，不做 src/utils 目录级豁免。
    files: ['src/utils/aircraft3d.js'],
    rules: {
      'no-unused-vars': 'off',
      'prefer-const': 'off',
    },
  },
]

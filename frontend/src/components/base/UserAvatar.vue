<script setup>
/**
 * 用户头像 UserAvatar
 *
 * 行为：
 *  - 有 src 时渲染 <img>，图片加载失败（含外链 403/网络错误）自动回退为首字母头像
 *  - 无 src / 加载失败：显示 name 首字符，底色按 name 稳定哈希取语义色，避免闪烁与随机换色
 *  - alt 文本优先取 alt，其次「{name} 的头像」，最后「用户头像」
 *  - 回退态使用 role="img" + aria-label，等效于图片的替代文本（无 information loss）
 */
import { ref, computed, watch } from 'vue'

const props = defineProps({
  /** 头像图片地址 */
  src: { type: String, default: '' },
  /** 用户名称：用于首字母回退与默认 alt 文本 */
  name: { type: String, default: '' },
  /** 直径（px） */
  size: { type: Number, default: 32 },
  /** 自定义 alt 文本 */
  alt: { type: String, default: '' },
})

const failed = ref(false)
/** 颜色取自全站语义色/主色，深浅色主题下都有足够对比度 */
const PALETTE = ['#0071e3', '#5e5ce6', '#30b0c7', '#248a3d', '#b86500', '#bf2d24', '#af52de']

watch(
  () => props.src,
  () => {
    failed.value = false
  },
)

const showImage = computed(() => !!props.src && !failed.value)
const altText = computed(() => props.alt || (props.name ? `${props.name} 的头像` : '用户头像'))

const initial = computed(() => {
  const name = String(props.name || '').trim()
  if (!name) return ''
  const chars = Array.from(name)
  return chars[0].toUpperCase()
})

const background = computed(() => {
  const name = String(props.name || '')
  let hash = 0
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 9973
  return PALETTE[hash % PALETTE.length]
})

const style = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  fontSize: `${Math.round(props.size * 0.42)}px`,
}))
const fallbackStyle = computed(() => ({ ...style.value, background: background.value }))
</script>

<template>
  <span class="cw-avatar" :style="showImage ? style : fallbackStyle">
    <img
      v-if="showImage"
      class="cw-avatar__img"
      :src="src"
      :alt="altText"
      loading="lazy"
      decoding="async"
      @error="failed = true"
    />
    <span v-else-if="initial" class="cw-avatar__initial" role="img" :aria-label="altText">
      {{ initial }}
    </span>
    <span v-else class="cw-avatar__placeholder" role="img" :aria-label="altText" aria-hidden="false">
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M12 14c-4 0-6 2-6 4v2h12v-2c0-2-2-4-6-4z" />
      </svg>
    </span>
  </span>
</template>

<style scoped>
.cw-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 50%;
  background: var(--glass-bg, rgba(255, 255, 255, 0.22));
  vertical-align: middle;
  user-select: none;
}
.cw-avatar__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.cw-avatar__initial {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: #fff;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.02em;
}
.cw-avatar__placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: #fff;
  background: rgba(120, 120, 128, 0.55);
}
.cw-avatar__placeholder svg {
  width: 62%;
  height: 62%;
}
</style>

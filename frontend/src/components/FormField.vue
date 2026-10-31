<script setup>
/**
 * 统一表单字段容器（对齐 CTYFLY-WEB 的 .field 结构）
 * label + 必填/选填标记 + 帮助文字 + 可滑入的错误提示
 */
defineProps({
  label: { type: String, default: '' },
  required: { type: Boolean, default: false },
  optional: { type: String, default: '' },
  hint: { type: String, default: '' },
  error: { type: String, default: '' },
  shake: { type: Boolean, default: false },
  /** 关联输入框 id（可访问性） */
  forId: { type: String, default: '' },
})
defineEmits(['animationend'])
</script>

<template>
  <div
    class="field"
    :class="{ 'is-error': !!error, 'is-shake': shake }"
    @animationend="$emit('animationend')"
  >
    <label v-if="label" class="label" :for="forId || undefined">
      {{ label }}
      <span v-if="required" class="required" aria-hidden="true">*</span>
      <span v-else-if="optional" class="optional">{{ optional }}</span>
    </label>
    <slot />
    <p v-if="hint && !error" class="hint">{{ hint }}</p>
    <div class="field-hint" :class="{ show: !!error }" role="alert" aria-live="polite">
      <div class="field-hint-text">{{ error }}</div>
    </div>
  </div>
</template>

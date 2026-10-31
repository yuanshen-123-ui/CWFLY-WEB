<script setup>
/**
 * 统一勾选控件（对齐 CTYFLY-WEB 的 CheckBox）
 * - 支持布尔 v-model，也支持数组 v-model（配合 value，用于多选）
 * - variant: 'check' 方形勾选 / 'switch' iOS 开关
 */
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: [Boolean, Array], default: false },
  value: { type: [String, Number, Boolean], default: undefined },
  label: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  id: { type: String, default: '' },
  variant: { type: String, default: 'check' },
})
const emit = defineEmits(['update:modelValue', 'change'])

const isChecked = computed(() => {
  if (Array.isArray(props.modelValue)) {
    return props.value === undefined ? false : props.modelValue.includes(props.value)
  }
  return !!props.modelValue
})

function onToggle() {
  if (props.disabled) return
  let next
  if (Array.isArray(props.modelValue)) {
    const list = [...props.modelValue]
    const idx = list.indexOf(props.value)
    if (idx >= 0) list.splice(idx, 1)
    else list.push(props.value)
    next = list
  } else {
    next = !props.modelValue
  }
  emit('update:modelValue', next)
  emit('change', next)
}
</script>

<template>
  <label class="cb" :class="[`cb-${variant}`, { checked: isChecked, disabled }]">
    <input
      :id="id || undefined"
      type="checkbox"
      class="cb-native"
      :checked="isChecked"
      :disabled="disabled"
      @change="onToggle"
    />
    <span v-if="variant === 'check'" class="cb-box" aria-hidden="true">
      <svg v-if="isChecked" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
    <span v-else class="cb-track" aria-hidden="true"><span class="cb-knob"></span></span>
    <span v-if="label" class="cb-label">{{ label }}</span>
  </label>
</template>

<style scoped>
.cb {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  cursor: pointer;
  user-select: none;
}
.cb.disabled { cursor: not-allowed; opacity: .45; }
.cb-native {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.cb-box {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  border: 1.5px solid var(--glass-border-strong);
  background: var(--glass-bg);
  color: #fff;
  flex-shrink: 0;
  transition: background .16s ease, border-color .16s ease, transform .16s ease;
}
.cb:hover .cb-box { border-color: var(--c-primary); }
.cb.checked .cb-box {
  background: var(--c-primary);
  border-color: var(--c-primary);
  transform: scale(1.04);
}
.cb:focus-within .cb-box { box-shadow: 0 0 0 3.5px rgba(0, 113, 227, .18); }
.cb-track {
  position: relative;
  width: 46px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 980px;
  background: rgba(128, 128, 128, .28);
  transition: background .24s ease;
}
.cb.checked .cb-track { background: var(--c-success, #30d158); }
.cb-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, .25);
  transition: transform .24s cubic-bezier(.3, 1.2, .5, 1);
}
.cb.checked .cb-knob { transform: translateX(18px); }
.cb-label { font-size: 13.5px; color: var(--c-text); }
</style>

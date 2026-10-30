<template>
  <Teleport to="body">
    <Transition name="abanner">
      <div v-if="actionState.visible" :key="actionState.key" class="action-banner" @mousedown.self="cancel">
        <template v-if="actionState.type === 'text' || actionState.type === 'secret'">
          <div class="action-banner__title">{{ actionState.title || '请输入' }}</div>
          <div class="action-banner__row">
            <input
              ref="inputEl"
              v-model="inputVal"
              :type="actionState.type === 'secret' ? 'password' : 'text'"
              class="action-banner__input"
              :placeholder="actionState.placeholder || '请输入'"
              @keydown.enter="commit"
              @keydown.esc="cancel"
            />
            <button class="action-banner__btn ok" @click="commit">确定</button>
            <button class="action-banner__btn" @click="cancel">取消</button>
          </div>
        </template>
        <template v-else-if="actionState.type === 'confirm'">
          <div class="action-banner__title">{{ actionState.title || '请确认' }}</div>
          <div class="action-banner__row">
            <button class="action-banner__btn ok" @click="confirmOk">确认</button>
            <button class="action-banner__btn" @click="cancel">取消</button>
          </div>
        </template>
        <!-- 其他控件类型在此扩展 -->
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { actionState, hideActionBanner } from '@/utils/bannerAction'

const inputVal = ref('')
const inputEl = ref(null)

// 每次显示时清空输入并聚焦
watch(() => actionState.visible, async (v) => {
  if (v) {
    inputVal.value = ''
    await nextTick()
    inputEl.value?.focus()
  }
})

function commit() {
  const v = inputVal.value.trim()
  if (!v) return
  const cb = actionState.onConfirm
  hideActionBanner()
  if (cb) cb(v)
}

function confirmOk() {
  const cb = actionState.onConfirm
  hideActionBanner()
  if (cb) cb()
}

function cancel() {
  hideActionBanner()
}
</script>

<style scoped>
.action-banner {
  position: fixed;
  top: calc(var(--header-h, 60px) + 8px);
  right: 16px;
  z-index: 2200;
  width: 360px;
  max-width: calc(100vw - 32px);
  padding: 16px 18px;
  border-radius: 14px;
  background: rgba(255, 255, 255, .95);
  border: 1px solid rgba(0, 0, 0, .1);
  box-shadow: 0 12px 34px rgba(0, 0, 0, .22);
  backdrop-filter: blur(14px) saturate(1.4);
  -webkit-backdrop-filter: blur(14px) saturate(1.4);
}
html[data-theme='dark'] .action-banner {
  background: rgba(28, 32, 42, .95);
  border-color: rgba(255, 255, 255, .1);
  box-shadow: 0 12px 34px rgba(0, 0, 0, .5);
}
.action-banner__title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 10px;
}
html[data-theme='dark'] .action-banner__title { color: #e5e7eb; }
.action-banner__row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.action-banner__input {
  flex: 1;
  min-width: 0;
  padding: 8px 12px;
  font-size: 13px;
  border: 1px solid rgba(0, 0, 0, .15);
  border-radius: 9px;
  outline: none;
  background: #fff;
  color: #1f2937;
}
html[data-theme='dark'] .action-banner__input {
  background: rgba(255, 255, 255, .08);
  color: #e5e7eb;
  border-color: rgba(255, 255, 255, .15);
}
.action-banner__input:focus {
  border-color: var(--c-primary, #1769d2);
  box-shadow: 0 0 0 3px rgba(23, 105, 210, .15);
}
.action-banner__btn {
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid rgba(0, 0, 0, .12);
  border-radius: 9px;
  background: transparent;
  color: #374151;
  cursor: pointer;
  transition: all .15s ease;
  white-space: nowrap;
}
html[data-theme='dark'] .action-banner__btn { color: #cbd5e1; border-color: rgba(255, 255, 255, .12); }
.action-banner__btn:hover { background: rgba(0, 0, 0, .06); }
html[data-theme='dark'] .action-banner__btn:hover { background: rgba(255, 255, 255, .1); }
.action-banner__btn.ok {
  background: var(--c-primary, #1769d2);
  color: #fff;
  border-color: transparent;
}
.action-banner__btn.ok:hover { background: var(--c-primary-dark, #0f5cb5); }

/* 滑入：从右侧向左弹出；滑出：向右侧缩回（无进度条） */
.abanner-enter-active { transition: transform .35s cubic-bezier(.22, 1, .36, 1), opacity .35s ease; }
.abanner-enter-from { transform: translateX(110%); opacity: 0; }
.abanner-leave-active { transition: transform .35s ease-in, opacity .35s ease; }
.abanner-leave-to { transform: translateX(110%); opacity: 0; }
</style>

<template>
  <Teleport to="body">
    <div v-if="visible" class="cookie-consent-overlay" @click.self="dismiss">
      <div class="cookie-consent">
        <div class="cookie-consent__content">
          <div class="cookie-consent__icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 8v4M12 16h.01"/>
            </svg>
          </div>
          <div class="cookie-consent__text">
            <p class="cookie-consent__title">本网站使用必要的本地存储</p>
            <p class="cookie-consent__desc">
                我们仅使用必要的本地存储来记住登录状态、主题与偏好，不使用广告或第三方统计 Cookie。
                你可以继续浏览，或查看《Cookie 政策》与《隐私政策》了解详情。
                <router-link to="/cookie-policy" class="cookie-consent__link" @click="dismiss">
                  查看 Cookie 政策 →
                </router-link>
                <span style="opacity:.35;margin:0 4px;">·</span>
                <router-link to="/privacy-policy" class="cookie-consent__link" @click="dismiss">
                  查看隐私政策 →
                </router-link>
              </p>
          </div>
        </div>
        <div class="cookie-consent__actions">
          <button class="btn btn-outline btn-sm" @click="reject">仅必要（推荐）</button>
          <button class="btn btn-primary btn-sm" @click="accept">接受</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const visible = ref(false)
const COOKIE_KEY = 'cw_cookie_consent'

onMounted(() => {
  const saved = localStorage.getItem(COOKIE_KEY)
  if (!saved) {
    // 延迟显示，等页面加载完成后再弹出
    setTimeout(() => { visible.value = true }, 500)
  }
})

function accept() {
  localStorage.setItem(COOKIE_KEY, 'accepted')
  visible.value = false
}

function reject() {
  localStorage.setItem(COOKIE_KEY, 'rejected')
  visible.value = false
}

function dismiss() {
  visible.value = false
}
</script>

<style scoped>
.cookie-consent-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 16px;
  animation: fadeIn .3s ease;
}

.cookie-consent {
  max-width: 640px;
  width: 100%;
  background: var(--c-bg-card, #fff);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  border: 1px solid var(--c-border, rgba(255,255,255,0.25));
  border-radius: 16px;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.12);
  animation: slideUp .3s ease;
}

.cookie-consent__content {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.cookie-consent__icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--c-primary-light, rgba(0,113,227,0.1));
  color: var(--c-primary, #0071e3);
  display: flex;
  align-items: center;
  justify-content: center;
}

.cookie-consent__text {
  flex: 1;
  min-width: 0;
}

.cookie-consent__title {
  font-weight: 700;
  font-size: 15px;
  margin-bottom: 4px;
  color: var(--c-text, #1d1d1f);
}

.cookie-consent__desc {
  font-size: 13px;
  line-height: 1.6;
  color: var(--c-text-secondary, #424245);
}

.cookie-consent__link {
  color: var(--c-primary, #0071e3);
  text-decoration: none;
  white-space: nowrap;
}
.cookie-consent__link:hover {
  text-decoration: underline;
}

.cookie-consent__actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes slideUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
</style>

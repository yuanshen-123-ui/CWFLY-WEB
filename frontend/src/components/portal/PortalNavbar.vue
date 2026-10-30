<template>
  <nav class="portal-nav">
    <div class="portal-nav__inner">
      <!-- Logo -->
      <router-link to="/" class="portal-nav__logo">
        <span class="portal-nav__brand">CWFLY</span>
      </router-link>

      <!-- 汉堡按钮（移动端） -->
      <button class="portal-nav__hamburger" @click="mobileOpen = !mobileOpen" :aria-label="mobileOpen ? '关闭菜单' : '打开菜单'">
        <span></span><span></span><span></span>
      </button>

      <!-- 导航链接 -->
      <div class="portal-nav__right" :class="{ 'portal-nav__right--open': mobileOpen }" ref="navRef">
        <!-- 关于我们（带下拉） -->
        <div class="portal-nav__item dropdown" @mouseenter="aboutOpen = true" @mouseleave="aboutOpen = false">
          <button class="portal-nav__link dropdown__trigger" @click="toggleAbout">
            <span>关于我们</span>
            <svg class="dropdown__arrow" :class="{ 'dropdown__arrow--up': aboutOpen }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <Transition name="drop">
            <div v-if="aboutOpen" class="dropdown__menu card" @click="aboutOpen = false">
              <router-link to="/about" class="dropdown__item">关于我们</router-link>
              <router-link to="/meetings" class="dropdown__item">会议记录</router-link>
            </div>
          </Transition>
        </div>

        <router-link to="/apply/controller" class="portal-nav__link">成为管制员</router-link>
        <router-link to="/controller-public" class="portal-nav__link">职员公示</router-link>

        <div class="portal-nav__spacer"></div>

        <!-- 主题切换 -->
        <div class="theme-toggle" role="group" aria-label="主题切换">
          <button v-for="t in themeOptions" :key="t.id" type="button" class="theme-btn" :class="{ active: themeMode === t.id }" @click="setTheme(t.id)">{{ t.label }}</button>
        </div>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { themeMode, setThemeMode } from '@/utils/theme'

const themeOptions = [
  { id: 'auto', label: 'Auto' },
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' },
]

const aboutOpen = ref(false)
const mobileOpen = ref(false)
const navRef = ref(null)

function setTheme(mode) {
  setThemeMode(mode)
}

function toggleAbout() {
  aboutOpen.value = !aboutOpen.value
}

function handleClickOutside(e) {
  if (navRef.value && !navRef.value.contains(e.target)) {
    aboutOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))
</script>

<style scoped>
.portal-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--header-h);
  background: var(--glass-bg-strong);
  backdrop-filter: blur(var(--glass-blur-lg)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur-lg)) saturate(var(--glass-saturate));
  border-bottom: 1px solid var(--glass-border-strong);
  z-index: 1000;
  box-shadow: var(--shadow-sm);
}

.portal-nav__inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 32px;
}

.portal-nav__logo {
  display: flex;
  align-items: center;
  text-decoration: none;
  flex-shrink: 0;
  /* 品牌链接颜色固定为文字色：避免 Chrome @property 主题过渡时,
     --c-text 短暂无效导致 span 回退继承外层链接的 --c-primary(蓝) 而闪蓝 */
  color: var(--c-text);
}
.portal-nav__logo:hover { text-decoration: none; }

.portal-nav__brand {
  font-size: 18px;
  font-weight: 700;
  color: var(--c-text);
  letter-spacing: -.3px;
}

/* 右侧区域 */
.portal-nav__right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
}

.portal-nav__spacer { flex: 1; }

/* 导航链接 */
.portal-nav__link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 500;
  color: var(--c-text);
  text-decoration: none;
  transition: background var(--transition);
  white-space: nowrap;
  background: none;
  border: none;
  cursor: pointer;
}
.portal-nav__link:hover {
  background: var(--c-bg);
  text-decoration: none;
}
.router-link-exact-active:not(.portal-nav__logo) {
  color: var(--c-primary) !important;
  background: var(--c-primary-light) !important;
}

/* 主题切换按钮组 */
.theme-toggle {
  display: flex;
  gap: 2px;
  align-items: center;
  padding: 2px;
  background: var(--glass-bg-strong);
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
}
.theme-btn {
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  background: transparent;
  color: var(--c-text-secondary);
  transition: background .15s, color .15s;
}
.theme-btn:hover {
  background: rgba(0, 0, 0, .05);
  color: var(--c-text);
}
.theme-btn.active {
  background: var(--c-primary);
  color: #fff;
}

html[data-theme='dark'] .theme-btn:hover {
  background: rgba(255, 255, 255, .08);
  color: var(--c-text);
}
html[data-theme='dark'] .theme-btn.active {
  background: rgba(10, 132, 255, .28);
  color: rgba(255, 255, 255, .95);
  box-shadow: inset 0 0 0 1px rgba(10, 132, 255, .35);
}

/* 下拉菜单 */
.dropdown { position: relative; }

.dropdown__trigger {
  font-family: inherit;
  font-size: 14px;
}

.dropdown__arrow {
  transition: transform .2s;
}
.dropdown__arrow--up { transform: rotate(180deg); }

.dropdown__menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 160px;
  padding: 6px;
  z-index: 1001;
  box-shadow: var(--shadow-md);
}

.dropdown__item {
  display: block;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  color: var(--c-text);
  font-size: 14px;
  text-decoration: none;
  transition: background var(--transition);
}
.dropdown__item:hover {
  background: var(--c-bg);
  text-decoration: none;
}

/* 下拉动画 */
.drop-enter-active, .drop-leave-active { transition: all .2s ease; }
.drop-enter-from, .drop-leave-to { opacity: 0; transform: translateY(-6px); }

/* 汉堡按钮（移动端） */
.portal-nav__hamburger {
  display: none;
  flex-direction: column;
  gap: 4px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
}
.portal-nav__hamburger span {
  display: block;
  width: 22px;
  height: 2px;
  background: var(--c-text);
  border-radius: 2px;
  transition: all .3s;
}

@media (max-width: 768px) {
  .portal-nav__hamburger { display: flex; }
  .portal-nav__right {
    display: none;
    position: absolute;
    top: var(--header-h);
    left: 0;
    right: 0;
    background: var(--c-white);
    border-bottom: 1px solid var(--c-border);
    flex-direction: column;
    padding: 12px 16px;
    gap: 4px;
    box-shadow: var(--shadow-md);
  }
  .portal-nav__right--open { display: flex; }
  .portal-nav__link { width: 100%; }
  .dropdown__menu {
    position: static;
    box-shadow: none;
    border: none;
    padding-left: 20px;
    margin-top: 4px;
  }
  .portal-nav__spacer { display: none; }
}
</style>

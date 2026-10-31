<template>
  <!-- 按时段缓渐变背景层（无用户自定义背景时显示） -->
  <div class="bg-time" v-show="!hasCustomBg" ref="bgTimeEl" aria-hidden="true">
    <div class="bg-time-img" :style="{ backgroundImage: curBg ? `url('${curBg}')` : 'none' }"></div>
    <div class="bg-time-img" :class="{ 'no-transition': themeFadingUi }" ref="bgLayer2" :style="{ backgroundImage: nextBg ? `url('${nextBg}')` : 'none' }"></div>
  </div>
  <!-- 手动(浅/深)→Auto 过渡合成层: 从当前画面平滑淡入到 Auto 当前时刻的完整渐变画面 -->
  <div class="bg-transition-layer" v-show="autoTransitionActive" ref="autoTransitionLayer" aria-hidden="true">
    <div class="bg-time-img" ref="autoTransA"></div>
    <div class="bg-time-img" ref="autoTransB"></div>
  </div>
  <!-- 用户自定义背景层（上传后 3s 渐变显示, 覆盖在时段背景层之上） -->
  <div class="custom-bg-layer" v-show="customBgActive" ref="customBgLayer" aria-hidden="true"></div>
  <router-view />
  <!-- 全局回顶按钮（滚动 > 600px 显示，点击平滑回顶） -->
  <FloatingButton />
  <!-- 全局红色横幅（错误 / 登录过期提示） -->
  <ToastBanner />
  <!-- 全局动作横幅（密码输入等控件，右侧滑入无进度条） -->
  <ActionBanner />
  <!-- 隐身 PoW：不渲染任何 DOM，后台静默完成人机验证 -->
  <PoWCaptcha />
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { getSocket } from '@/utils/socket'
import { useOnlineUsersStore } from '@/store/onlineUsers'
import { useUserStore } from '@/store/user'
import { profileApi } from '@/api'
import { getTimeBgState, getUpcomingBg } from '@/utils/timeBg'
import { themeMode, isDarkTheme, scheduleApplyTheme } from '@/utils/theme'
import FloatingButton from '@/components/FloatingButton.vue'
// 动效层：主题圆形扩散 / reduced-motion 全站降级 / 回顶按钮过渡
import '@/styles/motion.css'

const onlineStore = useOnlineUsersStore()
const user = useUserStore()

// 按时段缓渐变背景
const hasCustomBg = ref(false)
const curBg = ref('')
const nextBg = ref('')
const nextLoaded = ref(false)   // 渐变目标图是否已加载完成（未完成前保持 0, 防叠加偏色）
const bgLayer2 = ref(null)      // 渐变层2 DOM 引用（逐帧进度直接写 DOM, 绕过 Vue 响应式）
const customBgLayer = ref(null) // 用户自定义背景层 DOM（3s 渐变显示）
const customBgActive = ref(false) // 自定义背景层是否参与渲染
const autoTransitionLayer = ref(null) // 手动→Auto 过渡合成层（平滑渐变到当前时刻画面）
const autoTransA = ref(null)          // 过渡层·Auto 当前图
const autoTransB = ref(null)          // 过渡层·Auto 下一图（按当前进度叠加）
const autoTransitionActive = ref(false)
const bgTimeEl = ref(null)            // 正式时段背景层(.bg-time) DOM, cross-fade 时淡出
let autoTransTimer = null
let fade = 0                    // 当前渐变进度（普通变量, 不走响应式, 避免 60fps 重渲染干扰其它组件过渡）
let bgTimer = null
let customCheckTimer = null

// 主题固定背景: 手动浅色→eve_3, 手动深色→nt_4; auto 时按北京时间时间表
const THEME_FIXED_BG = { light: '/bg-home/eve_3.webp', dark: '/bg-home/nt_4.webp' }
let themeFading = false          // 主题固定图淡入过渡中（暂停时间表刷新, 避免打断淡入）
const themeFadingUi = ref(false) // 模板侧开关: 淡入期间禁用 layer1 的 CSS transition, 避免与 JS 驱动打架
let themeRafId = null            // 当前淡入动画 rAF id（中途切换时取消旧动画）

/** 预加载图片（返回 Promise, 完成/失败均 resolve, 不抛错） */
function preloadImg(url) {
  return new Promise((resolve) => {
    const im = new Image()
    im.onload = () => resolve(true)
    im.onerror = () => resolve(false)
    im.src = url
  })
}

/** 将渐变进度写入 layer2 的 opacity（直接操作 DOM, 不经 Vue 响应式, 避免每帧重渲染干扰其它组件过渡） */
function applyFade() {
  if (!bgLayer2.value) return
  bgLayer2.value.style.opacity = nextLoaded.value ? String(fade) : '0'
}

// 懒加载「另一个配色」的主题固定图
function preloadOtherThemeBg() {
  const fixed = THEME_FIXED_BG[themeMode.value]
  if (fixed) {
    preloadImg(fixed === THEME_FIXED_BG.light ? THEME_FIXED_BG.dark : THEME_FIXED_BG.light)
  } else {
    // auto: 预加载当前深浅相反的主题固定图
    preloadImg(isDarkTheme() ? THEME_FIXED_BG.light : THEME_FIXED_BG.dark)
  }
}

function updateTimeBg() {
  if (themeFading) return // 主题固定图淡入过渡中, 保持当前状态
  const fixed = THEME_FIXED_BG[themeMode.value]
  const s = fixed
    ? { curBg: fixed, nextBg: '', fade: 0, preload: '' }
    : getTimeBgState()
  curBg.value = s.curBg
  // 目标图变化时: 重新预加载并等待完成; 未完成前 opacity 保持 0, 避免两张半透明图叠加偏色
  if (s.nextBg !== nextBg.value) {
    nextBg.value = s.nextBg
    nextLoaded.value = false
    if (s.nextBg) {
      preloadImg(s.nextBg).then(() => { nextLoaded.value = true; applyFade() })
    } else {
      nextLoaded.value = true
    }
  }
  fade = s.fade
  applyFade()
  // 提前预加载「下一次渐变目标图」, 保证渐变开始时图片已完全就绪
  if (s.preload && s.preload !== curBg.value && s.preload !== nextBg.value) {
    preloadImg(s.preload)
  }
  // 无论当前主题模式, 都缓存 auto 时间表的「当前图+下一图+10分钟后图」,
  // 保证从深/浅色切到 auto 时目标图已就绪、立即开始渐变,
  // 不会出现「切 auto 时浅色图未缓存、延迟约2秒才冒出来」的问题
  const autoState = getTimeBgState()
  const warm = [autoState.curBg, autoState.nextBg, getUpcomingBg(10)]
    .filter(u => u && u !== curBg.value && u !== nextBg.value && u !== s.preload)
  warm.forEach(u => preloadImg(u))
}

// 从当前 fade 平滑过渡到 to（3s）, 结束后回调 onDone（中途切换会取消旧动画）
function animateFade(to, onDone) {
  cancelAnimationFrame(themeRafId)
  const FADE_MS = 3000
  const from = fade
  const start = performance.now()
  const step = () => {
    const p = Math.min(1, (performance.now() - start) / FADE_MS)
    fade = from + (to - from) * p
    applyFade()
    if (p < 1) themeRafId = requestAnimationFrame(step)
    else onDone()
  }
  themeRafId = requestAnimationFrame(step)
}

/**
 * 切回 auto 后的平滑续接:
 * 切换动画把「当前时段图」淡入完成后, auto 的下一图(如 eve_4)从未显示过,
 * 若直接套用 updateTimeBg 的真实进度(如 0.232)会瞬间叠加 → 最后 1 秒跳变。
 * 这里让下一图从 0 平滑淡入到「当前应处进度」, 之后由 10s 定时器续推。
 */
function restartAutoFade() {
  const myToken = themeSwitchToken
  const s = getTimeBgState()
  curBg.value = s.curBg
  nextBg.value = s.nextBg || ''
  nextLoaded.value = false
  fade = 0
  applyFade()
  if (s.nextBg) {
    // 追赶动画期间暂停 10s 定时器刷新(themeFading), 防止 updateTimeBg
    // 中途把 fade 覆盖为新的真实进度 → 进度瞬间跳变(如突然跑到 nt_4)
    themeFading = true
    preloadImg(s.nextBg).then(() => {
      if (myToken !== themeSwitchToken) return
      nextLoaded.value = true
      animateFade(s.fade, () => {
        if (myToken !== themeSwitchToken) return
        themeFading = false
        updateTimeBg() // 追赶完成后恢复定时器, 从当前进度继续推进
      })
    })
  } else {
    nextLoaded.value = true
    applyFade()
  }
}

/**
 * 手动(浅/深)→Auto: 用过渡合成层平滑渐变到「Auto 当前时刻的完整渐变画面」。
 * 过渡层内容 = A(auto 当前图, 全显) + B(auto 下一图, 按当前真实进度叠加),
 * 整体从 0 淡入 3s 覆盖当前画面; 完成后把该合成画面固化到正式层, 恢复 10s 定时器推进。
 * 这样从浅色/深色切 Auto 最终呈现的是「当前时刻 nt_3+61%nt_4 的叠加」, 而非先纯 nt_3 再让 nt_4 从 0 淡入。
 */
function startAutoTransition() {
  clearTimeout(autoTransTimer)
  const myToken = themeSwitchToken
  const s = getTimeBgState()
  const layer = autoTransitionLayer.value
  const A = autoTransA.value
  const B = autoTransB.value
  if (!layer || !A) return
  A.style.backgroundImage = s.curBg ? `url('${s.curBg}')` : 'none'
  A.style.opacity = '1'
  if (B) {
    B.style.backgroundImage = s.nextBg ? `url('${s.nextBg}')` : 'none'
    B.style.opacity = s.nextBg ? String(s.fade) : '0'
  }
  autoTransitionActive.value = true
  // 预加载当前图+下一图后再淡入, 避免淡入时白屏
  const loads = [s.curBg, s.nextBg].filter(Boolean).map(preloadImg)
  Promise.all(loads).then(() => {
    if (myToken !== themeSwitchToken) return // 已切到新主题, 放弃本次过渡
    // 背景渐变真正开始时, 才开始 2s 后的 UI 配色切换(与情况 A/B 一致)
    scheduleApplyTheme()
    // 标准 cross-fade: 当前应用的图(.bg-time)淡出 + 合成画面(过渡层)淡入,
    // 避免当前图保持全显导致「当前图+合成画面」三层叠加浑浊
    const bgTime = bgTimeEl.value
    if (bgTime) { bgTime.style.transition = 'opacity 3s ease'; bgTime.style.opacity = '0' }
    layer.style.transition = 'opacity 3s ease'
    layer.style.opacity = '0'
    layer.getBoundingClientRect() // 强制重排, 触发 0→1 的 transition
    layer.style.opacity = '1'
    autoTransTimer = setTimeout(() => {
      if (myToken !== themeSwitchToken) return
      finishAutoTransition(s)
    }, 3000)
  })
}

/** 过渡完成: 将合成画面固化到正式层(并恢复其透明度), 恢复 10s 定时器推进 */
function finishAutoTransition(s) {
  curBg.value = s.curBg
  nextBg.value = s.nextBg || ''
  nextLoaded.value = true // 图已在过渡层加载完成, 直接按当前进度显示(不重新从 0 淡入)
  fade = s.fade
  applyFade()
  const bgTime = bgTimeEl.value
  if (bgTime) { bgTime.style.transition = 'none'; bgTime.style.opacity = '1' }
  const layer = autoTransitionLayer.value
  if (layer) { layer.style.transition = 'none'; layer.style.opacity = '0' }
  autoTransitionActive.value = false
  updateTimeBg() // 恢复 10s 定时器, 从当前进度继续推进
}

/** 主题切换完成后同步背景: auto → 平滑续接; 手动(浅/深) → 恢复 10s 时间表循环 */
function syncBgAfterThemeChange() {
  if (themeMode.value === 'auto') {
    restartAutoFade()
  } else {
    updateTimeBg()
  }
}

// 主题模式变化: 浅色→eve_3, 深色→nt_4, auto→时间表图。
// 任何切换都从「当前中间帧」平滑过渡到目标图（目标=底层图则淡出, 否则淡入）,
// 避免动画中途切换时瞬间跳到另一张图。
let themeSwitchToken = 0 // 主题切换令牌: 每次切换递增, 使旧的异步回调失效(防快速切换竞态)
let prevThemeMode = themeMode.value // 上一次主题模式: 区分「从 auto 渐变切走」vs「手动渐变中再切走」

watch(themeMode, () => {
  cancelAnimationFrame(themeRafId)
  clearTimeout(autoTransTimer)
  const myToken = ++themeSwitchToken
  // 若上一次 auto 过渡层淡入未完成就被再次切换: 重置过渡层并恢复正式层透明度
  if (autoTransitionActive.value) {
    autoTransitionActive.value = false
    const transLayer = autoTransitionLayer.value
    if (transLayer) { transLayer.style.transition = 'none'; transLayer.style.opacity = '0' }
    const bgTime = bgTimeEl.value
    if (bgTime) { bgTime.style.transition = 'none'; bgTime.style.opacity = '1' }
  }
  const wasAuto = prevThemeMode === 'auto'
  prevThemeMode = themeMode.value
  const fixed = THEME_FIXED_BG[themeMode.value]
  const target = fixed || getTimeBgState().curBg

  // 从手动(浅/深)切到 auto: 用「过渡合成层」平滑渐变到 Auto 当前时刻的完整渐变画面
  // (如 nt_3+61%nt_4 叠加), 而不是先纯 nt_3 再让 nt_4 从 0 淡入
  if (themeMode.value === 'auto' && !wasAuto) {
    startAutoTransition()
    return
  }

  // 折叠 Auto 渐变中间画面(仅当「从 auto 渐变中切走」): 把当前视觉主导图定格为 layer1,
  // 使新主题的渐变从 Auto 当前实际看到的图片开始, 而不是跳回渐变起点的 from 图。
  // 手动主题渐变中途再切走(如浅色淡入中切深色)不折叠——保留 layer2 由情况 A 平滑淡出,
  // 避免浅色画面被瞬间清空导致「直接切换无渐变」
  if (wasAuto && nextBg.value && fade > 0) {
    if (fade >= 0.5) {
      curBg.value = nextBg.value  // 渐变已过半, 视觉主导是 nextBg
    }
    nextBg.value = ''
    nextLoaded.value = true
    fade = 0
    applyFade()
  }

  // 情况 A: 目标即当前底层图（已缓存）→ 淡出 layer1（若有内容）平滑回退到目标图, 然后清空
  if (target === curBg.value) {
    if (nextBg.value) {
      themeFading = true
      themeFadingUi.value = true
      scheduleApplyTheme() // 目标图已在显示, 无需等缓存, 立即起 2s UI 计时
      animateFade(0, () => {
        if (myToken !== themeSwitchToken) return
        nextBg.value = ''
        nextLoaded.value = true
        applyFade()
        themeFading = false
        themeFadingUi.value = false
        syncBgAfterThemeChange()
      })
    } else {
      scheduleApplyTheme()
      syncBgAfterThemeChange()
    }
    return
  }

  // 情况 B: 目标 != 底层图 → layer1 换目标图, 并从当前 fade 淡入到 1, 完成后定格
  themeFading = true
  themeFadingUi.value = true
  const finish = () => {
    if (myToken !== themeSwitchToken) return // 淡入期间被再次切换, 放弃本次定格
    curBg.value = target
    nextBg.value = ''
    nextLoaded.value = true
    applyFade()
    themeFading = false
    themeFadingUi.value = false
    syncBgAfterThemeChange() // auto → 平滑续接下一图; 手动 → 恢复 10s 时间表循环
  }
  if (nextBg.value !== target) {
    nextBg.value = target
    nextLoaded.value = false
    fade = 0 // 新目标图: 等缓存完成后从 0 开始淡入, 避免沿用旧 fade 瞬间跳到中途值
    applyFade()
    preloadImg(target).then(() => {
      if (myToken !== themeSwitchToken) return
      nextLoaded.value = true
      scheduleApplyTheme() // 图片缓存完成、渐变真正开始时, 才开始 2s 后的 UI 切换
      animateFade(1, finish)
    })
  } else {
    // 同图: 从当前 fade 继续淡入到 1（中途切换同目标时不断顿、不重头）
    nextLoaded.value = true
    scheduleApplyTheme()
    animateFade(1, finish)
  }
})

/**
 * 用户自定义背景：设置背景图并在预加载完成后 3s 淡入（transition 在 CSS 中定义）。
 * 渐变期间保持时段背景层(.bg-time)显示作为底层, 3s 过渡完成后才隐藏它。
 * @param {string} fullUrl 带缓存戳的完整背景 URL（空串=移除自定义背景）
 */
function applyCustomBg(fullUrl) {
  const el = customBgLayer.value
  const u = (fullUrl || '').trim()
  if (!u) {
    customBgActive.value = false
    hasCustomBg.value = false
    if (el) { el.style.opacity = '0'; el.style.backgroundImage = 'none' }
    return
  }
  customBgActive.value = true
  if (el) {
    el.style.backgroundImage = `url('${u}')`
    el.style.opacity = '0'
    preloadImg(u).then(() => {
      if (customBgLayer.value !== el) return
      el.getBoundingClientRect() // 强制重排, 确保 0→1 的 transition 被触发
      el.style.opacity = '1'
      // 3s 过渡完成后隐藏时段背景层
      setTimeout(() => { hasCustomBg.value = true }, 3000)
    })
  } else {
    hasCustomBg.value = true
  }
}

// 检测用户是否设置了自定义背景(--custom-bg), 变化时同步到渐变层
let lastCustomBgValue = ''
function checkCustomBg() {
  const v = (document.documentElement.style.getPropertyValue('--custom-bg') || '').trim()
  if (v === lastCustomBgValue) return
  lastCustomBgValue = v
  const m = v.match(/url\(["']?(.*?)["']?\)/)
  applyCustomBg(m ? m[1] : '')
}

/** 加载自定义背景图（登录时） */
function loadBg() {
  const t = user.token.value
  if (!t) return
  profileApi.get().then(res => {
    const bg = (res.data?.bgImage || '').trim()
    const full = bg ? bg + '?t=' + Date.now() : ''
    if (full) {
      document.documentElement.style.setProperty('--custom-bg', `url(${JSON.stringify(full)})`)
    } else {
      document.documentElement.style.removeProperty('--custom-bg')
    }
    applyCustomBg(full)
  }).catch(() => {})
}

// 监听登录状态变化（登出→重新登录时重新加载背景）
watch(() => user.token.value, (newToken, oldToken) => {
  if (newToken && !oldToken) {
    loadBg()
  }
  if (!newToken) {
    document.documentElement.style.removeProperty('--custom-bg')
  }
})

// 监听个人中心上传/删除背景图（即时 3s 渐变, 不必等轮询）
const onCustomBgEvent = (e) => applyCustomBg(e.detail || '')
window.addEventListener('cw:custom-bg', onCustomBgEvent)

onMounted(() => {
  updateTimeBg()
  checkCustomBg()
  bgTimer = setInterval(updateTimeBg, 10000)          // 每 10 秒刷新渐变进度
  customCheckTimer = setInterval(checkCustomBg, 2000)  // 每 2 秒检测自定义背景
  // 预加载深浅两套固定图, 保证任意主题切换（浅↔深）都即时渐变,
  // 不因首次加载未缓存而延迟, 也不会在「浅色渐变未完成」时切换导致深色图卡在 0
  preloadImg(THEME_FIXED_BG.light)
  preloadImg(THEME_FIXED_BG.dark)
  // 页面加载完成后, 后台懒加载「另一个配色」固定图 + auto 时间表当前图/下一图
  const idleLoad = () => {
    preloadOtherThemeBg()
    const autoState = getTimeBgState()
    ;[autoState.curBg, autoState.nextBg, getUpcomingBg(10)].forEach(u => { if (u) preloadImg(u) })
  }
  if ('requestIdleCallback' in window) {
    requestIdleCallback(idleLoad, { timeout: 5000 })
  } else {
    window.addEventListener('load', idleLoad, { once: true })
    setTimeout(idleLoad, 3000)
  }
  loadBg()
  const socket = getSocket()

  socket.on('online:count', (n) => {
    onlineStore.setOnlineCount(n)
  })

  socket.on('online:list', (list) => {
    onlineStore.setOnlineList(list)
  })

  socket.on('connect', () => {
    // 通知后端本用户上线（触发后端广播最新数据）
    socket.emit('user:online')
  })

  // 心跳：每 60 秒发一次，防止僵尸连接
  setInterval(() => socket.emit('user:heartbeat'), 60000)
})

onUnmounted(() => {
  if (bgTimer) clearInterval(bgTimer)
  if (customCheckTimer) clearInterval(customCheckTimer)
  window.removeEventListener('cw:custom-bg', onCustomBgEvent)
  // App.vue 一般不卸载，保留 socket 连接
})
</script>

<style scoped>
/* 按时段缓渐变背景层：置于内容之下，pointer-events 穿透 */
.bg-time {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  overflow: hidden;
}
.bg-time-img {
  position: absolute;
  inset: 0;
  background-position: center;
  background-size: cover;
  background-repeat: no-repeat;
  transition: opacity 3s ease;
}
/* 主题 JS 驱动淡入期间禁用 CSS transition, 避免每帧目标值被 3s 过渡拖慢 */
.bg-time-img.no-transition { transition: none; }

/* 手动→Auto 过渡合成层：置于时段背景层之上(DOM 顺序), 平滑淡入到 Auto 当前时刻画面 */
.bg-transition-layer {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  overflow: hidden;
  opacity: 0;
}
.bg-transition-layer .bg-time-img {
  position: absolute;
  inset: 0;
  background-position: center;
  background-size: cover;
  background-repeat: no-repeat;
  transition: none;
}

/* 用户自定义背景层：置于内容之下、时段背景层之上(DOM 顺序), 上传后 3s 渐变显示 */
.custom-bg-layer {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-position: center;
  background-size: cover;
  background-repeat: no-repeat;
  opacity: 0;
  transition: opacity 3s ease;
}
</style>

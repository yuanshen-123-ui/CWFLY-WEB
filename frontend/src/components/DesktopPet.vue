<template>
  <!-- 桌宠本体（默认开启，可隐藏） -->
  <div
    v-if="enabled"
    ref="petRef"
    class="pet"
    :class="{ 'pet--dragging': dragging, 'pet--jump': jumping, 'pet--wake': waking }"
    :style="petStyle"
    @contextmenu.prevent="openPanel"
  >
    <!-- 未读角标 -->
    <span v-if="unreadCount > 0" class="pet__badge">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>

    <!-- 自定义按钮（悬停显示） -->
    <button class="pet__gear" title="自定义桌宠" @click.stop="openPanel">
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    </button>

    <!-- 隐藏桌宠（悬停显示） -->
    <button class="pet__hide" title="隐藏桌宠" @click.stop="hidePet">✕</button>

    <!-- 新通知气泡 -->
    <Transition name="bubble">
      <div v-if="bubble" class="pet__bubble pet__bubble--notify" :style="bubbleStyle" @click.stop="goNotifications">
        <span class="pet__bubble-type">{{ bubble.typeLabel }}</span>
        <span class="pet__bubble-title">{{ bubble.title }}</span>
        <span class="pet__bubble-text">{{ bubble.content }}</span>
      </div>
    </Transition>

    <!-- 说话气泡 -->
    <Transition name="bubble">
      <div v-if="phrase" class="pet__bubble pet__bubble--phrase" :style="bubbleStyle" @click.stop="phrase = ''">
        {{ phrase }}
      </div>
    </Transition>

    <!-- 宠物本体 -->
    <div class="pet__cat" @click="onClick" @mousedown="startDrag">
      <PetFigure :config="config" :size="96" />
    </div>

    <!-- ===== 自定义面板 ===== -->
    <Teleport to="body">
      <div v-if="panelOpen" class="pet-panel-overlay" @click.self="closePanel">
        <div class="pet-panel card">
          <div class="pet-panel__header">
            <h3>桌宠自定义</h3>
            <button class="pet-panel__close" @click="closePanel">✕</button>
          </div>

          <div class="pet-panel__body">
            <!-- 实时预览 -->
            <div class="pet-panel__preview">
              <div class="pet-panel__preview-stage">
                <PetFigure :config="draft" :size="132" />
              </div>
              <div class="pet-panel__name">{{ presetName }}</div>
              <button class="btn btn-outline btn-sm pet-panel__random" @click="randomize">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true">
                  <rect x="3.5" y="3.5" width="17" height="17" rx="4"/>
                  <circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none"/>
                  <circle cx="16" cy="8" r="1.3" fill="currentColor" stroke="none"/>
                  <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>
                  <circle cx="8" cy="16" r="1.3" fill="currentColor" stroke="none"/>
                  <circle cx="16" cy="16" r="1.3" fill="currentColor" stroke="none"/>
                </svg>
                随机换肤
              </button>
            </div>

            <div class="pet-panel__controls">
              <!-- 预设 -->
              <div class="pet-panel__section">
                <div class="pet-panel__label">预设形象（10 种）</div>
                <div class="pet-presets">
                  <button v-for="p in PRESETS" :key="p.type" class="pet-preset"
                          :class="{ 'pet-preset--active': draft.type === p.type }"
                          @click="selectPreset(p)">
                    <PetFigure :config="{ type: p.type, color: p.color, belly: p.belly, accessory: draft.accessory }" :size="44" />
                    <span>{{ p.name }}</span>
                  </button>
                </div>
              </div>

              <!-- 颜色 -->
              <div class="pet-panel__section">
                <div class="pet-panel__label">毛色</div>
                <div class="pet-colors">
                  <button v-for="c in MAIN_COLORS" :key="c" class="pet-color"
                          :class="{ 'pet-color--active': draft.color === c }"
                          :style="{ background: c }" :title="c" @click="draft.color = c"></button>
                  <label class="pet-color pet-color--custom" title="自定义颜色">
                    <input type="color" v-model="draft.color" />
                  </label>
                </div>
                <div class="pet-panel__label" style="margin-top:10px;">肚皮 / 脸部</div>
                <div class="pet-colors">
                  <button v-for="c in BELLY_COLORS" :key="c" class="pet-color"
                          :class="{ 'pet-color--active': draft.belly === c }"
                          :style="{ background: c }" :title="c" @click="draft.belly = c"></button>
                  <label class="pet-color pet-color--custom" title="自定义颜色">
                    <input type="color" v-model="draft.belly" />
                  </label>
                </div>
              </div>

              <!-- 配饰 -->
              <div class="pet-panel__section">
                <div class="pet-panel__label">配饰</div>
                <div class="pet-accessories">
                  <button v-for="a in ACCESSORIES" :key="a.id" class="pet-accessory"
                          :class="{ 'pet-accessory--active': draft.accessory === a.id }"
                          @click="draft.accessory = a.id">
                    <PetFigure :config="{ ...draft, accessory: a.id }" :size="40" />
                    <span>{{ a.name }}</span>
                  </button>
                </div>
              </div>

              <!-- 自定义对话 -->
              <div class="pet-panel__section">
                <div class="pet-panel__label">自定义对话</div>
                <div class="pet-phrases">
                  <div class="pet-phrases__row">
                    <input v-model="newPhrase" class="input" placeholder="输入新的对话内容…" maxlength="60" @keyup.enter="addPhrase" />
                    <button class="btn btn-primary btn-sm" @click="addPhrase">添加</button>
                  </div>
                  <p v-if="phraseFeedback" class="pet-phrases__fb" :class="'pet-phrases__fb--' + phraseFeedback.type">{{ phraseFeedback.text }}</p>
                  <ul class="pet-phrases__list">
                    <li v-for="(p, i) in phrases" :key="i" class="pet-phrases__item">
                      <span class="pet-phrases__text">{{ p }}</span>
                      <button class="pet-phrases__del" title="删除" @click="removePhrase(i)">✕</button>
                    </li>
                  </ul>
                  <p v-if="!phrases.length" class="text-sm text-muted" style="margin-top:8px;">已删除全部对话，点击宠物时将显示「喵～」</p>
                </div>
              </div>
            </div>
          </div>

          <div class="pet-panel__footer">
            <label class="pet-panel__switch">
              <input type="checkbox" :checked="enabled" @change="onToggleEnabled" />
              <span class="pet-panel__switch-slider"></span>
              <span class="pet-panel__switch-label">显示桌宠</span>
            </label>
            <div class="pet-panel__footer-spacer"></div>
            <button class="btn btn-outline btn-sm" @click="resetDefault">恢复默认</button>
            <button class="btn btn-primary btn-sm" @click="applyConfig">应用</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>

  <!-- 已隐藏时的唤醒按钮 -->
  <button v-else class="pet-ghost" @click="showPet" title="显示桌宠">
    <span class="pet-ghost__paw">🐾</span>
    <span>桌宠已隐藏 · 点击唤醒</span>
  </button>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api'
import PetFigure from './PetFigure.vue'

const router = useRouter()

// ---------- 预设与配色 ----------
const PRESETS = [
  { type: 'cat', name: '橘猫', color: '#f6a63a', belly: '#ffe9c7' },
  { type: 'dog', name: '柴犬', color: '#eab45f', belly: '#fff3d6' },
  { type: 'panda', name: '熊猫', color: '#ffffff', belly: '#f5f7fa' },
  { type: 'bunny', name: '兔子', color: '#ffffff', belly: '#f7dbe6' },
  { type: 'fox', name: '狐狸', color: '#f2854a', belly: '#fff3e0' },
  { type: 'bear', name: '棕熊', color: '#b57a4a', belly: '#e8cfa8' },
  { type: 'penguin', name: '企鹅', color: '#5a6b7d', belly: '#ffffff' },
  { type: 'frog', name: '青蛙', color: '#7bc96f', belly: '#ddf3d2' },
  { type: 'chick', name: '小鸡', color: '#ffd34e', belly: '#fff6d6' },
  { type: 'hamster', name: '仓鼠', color: '#e3a869', belly: '#fff0dd' },
]
const MAIN_COLORS = ['#f6a63a', '#eab45f', '#f2854a', '#e05d5d', '#f4a7b9', '#9b6ad8', '#5a9be0', '#7bc96f', '#ffd34e', '#8a6a45']
const BELLY_COLORS = ['#ffe9c7', '#fff3d6', '#ffffff', '#f7dbe6', '#ddf3d2', '#dbe8f7', '#f6e2c8', '#ece6f7']
const ACCESSORIES = [
  { id: 'none', name: '无' },
  { id: 'pilot', name: '机长帽' },
  { id: 'hat', name: '礼帽' },
  { id: 'bow', name: '蝴蝶结' },
  { id: 'scarf', name: '围巾' },
  { id: 'glasses', name: '眼镜' },
  { id: 'headset', name: '耳机' },
]
const DEFAULT_CONFIG = { type: 'cat', color: '#f6a63a', belly: '#ffe9c7', accessory: 'none' }

function loadSaved() {
  try {
    const s = JSON.parse(localStorage.getItem('cw_pet_config'))
    if (s && s.type && s.color) return { ...DEFAULT_CONFIG, ...s }
  } catch { /* 忽略 */ }
  return null
}

const enabled = ref(localStorage.getItem('cw_pet_enabled') !== '0')
function saveEnabled() { localStorage.setItem('cw_pet_enabled', enabled.value ? '1' : '0') }
function hidePet() { enabled.value = false; saveEnabled() }
function showPet() {
  enabled.value = true
  saveEnabled()
  // 唤醒动画 + 起床卖萌
  waking.value = true
  setTimeout(() => (waking.value = false), 900)
  showPhrase('喵~ 睡醒啦！')
}
function onToggleEnabled(e) { enabled.value = e.target.checked; saveEnabled() }

const config = ref(loadSaved() || { ...DEFAULT_CONFIG })
const draft = ref({ ...config.value })
const panelOpen = ref(false)

const presetName = computed(() => {
  const p = PRESETS.find(x => x.type === draft.value.type)
  return p ? p.name : draft.value.type
})

function selectPreset(p) {
  draft.value.type = p.type
  draft.value.color = p.color
  draft.value.belly = p.belly
}
function randomize() {
  const p = PRESETS[Math.floor(Math.random() * PRESETS.length)]
  draft.value.type = p.type
  draft.value.color = MAIN_COLORS[Math.floor(Math.random() * MAIN_COLORS.length)]
  draft.value.belly = BELLY_COLORS[Math.floor(Math.random() * BELLY_COLORS.length)]
  draft.value.accessory = ACCESSORIES[Math.floor(Math.random() * ACCESSORIES.length)].id
}
function openPanel() {
  draft.value = { ...config.value }
  panelOpen.value = true
}
function closePanel() {
  panelOpen.value = false
}
function applyConfig() {
  config.value = { ...draft.value }
  localStorage.setItem('cw_pet_config', JSON.stringify(config.value))
  panelOpen.value = false
}
function resetDefault() {
  draft.value = { ...DEFAULT_CONFIG }
  config.value = { ...DEFAULT_CONFIG }
  localStorage.removeItem('cw_pet_config')
  panelOpen.value = false
}

// ---------- 状态 ----------
const petRef = ref(null)
const pos = ref(null)
const dragging = ref(false)
const jumping = ref(false)
const waking = ref(false)
const unreadCount = ref(0)
const bubble = ref(null)
const phrase = ref('')

let lastUnread = -1
let pollTimer = null
let phraseTimer = null
let bubbleTimer = null
let downPos = null
let dragStart = null
let moved = false

const PHRASE_DEFAULT = [
  '喵~ 今天也要好好连飞哦！',
  '有飞行计划要交吗？',
  '管制员在看着你呢～',
  '小心不要低于决断高哦！',
  '困了……先睡一会儿 zZ',
  '我在帮你盯着活动报名呢',
  '要不要去在线地图看看？',
]

// ---------- 自定义对话（可增删，存 localStorage） ----------
const phrases = ref(loadPhrases())
const newPhrase = ref('')
const phraseFeedback = ref(null)
let feedbackTimer = null
function loadPhrases() {
  try {
    const s = JSON.parse(localStorage.getItem('cw_pet_phrases'))
    if (Array.isArray(s)) {
      const arr = s.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim())
      if (arr.length) return arr
    }
  } catch { /* 忽略 */ }
  return [...PHRASE_DEFAULT]
}
function savePhrases() { localStorage.setItem('cw_pet_phrases', JSON.stringify(phrases.value)) }
function flashFeedback(type, text) {
  phraseFeedback.value = { type, text }
  clearTimeout(feedbackTimer)
  feedbackTimer = setTimeout(() => (phraseFeedback.value = null), 1800)
}
function addPhrase() {
  const t = newPhrase.value.trim()
  if (!t) {
    flashFeedback('fail', '添加失败：内容不能为空')
    return
  }
  phrases.value.push(t)
  newPhrase.value = ''
  savePhrases()
  flashFeedback('ok', '添加成功～')
}
function removePhrase(i) {
  phrases.value.splice(i, 1)
  savePhrases()
}
function pickPhrase() {
  if (!phrases.value.length) return '喵～'
  return phrases.value[Math.floor(Math.random() * phrases.value.length)]
}

const petStyle = computed(() => {
  if (pos.value) {
    return { left: pos.value.x + 'px', top: pos.value.y + 'px', right: 'auto', bottom: 'auto' }
  }
  return {}
})

// 气泡定位：居中于桌宠头顶，靠边缘自动内收；箭头始终指向桌宠头（--arrow-left）
const bubbleStyle = computed(() => {
  const petW = 96
  const bw = 232
  const petCenter = currentLeft() + petW / 2
  let left = petCenter - bw / 2
  left = clamp(left, 8, window.innerWidth - bw - 8)
  // 箭头水平位置：对准宠物中心，并 clamp 在气泡内部
  let arrowLeft = petCenter - left
  arrowLeft = clamp(arrowLeft, 18, bw - 18)
  const bottom = window.innerHeight - currentTop() + 6
  return {
    position: 'fixed',
    left: left + 'px',
    bottom: bottom + 'px',
    right: 'auto',
    transform: 'none',
    '--arrow-left': arrowLeft + 'px'
  }
})

function clamp(v, min, max) { return Math.min(Math.max(v, min), max) }
function currentLeft() { return pos.value ? pos.value.x : window.innerWidth - 140 }
function currentTop() { return pos.value ? pos.value.y : window.innerHeight - 160 }

// ---------- 拖拽 ----------
function startDrag(e) {
  if (e.button !== 0) return
  downPos = { x: e.clientX, y: e.clientY }
  dragStart = { x: e.clientX - currentLeft(), y: e.clientY - currentTop() }
  moved = false
  dragging.value = true
  window.addEventListener('mousemove', onDrag)
  window.addEventListener('mouseup', endDrag)
  e.preventDefault()
}
function onDrag(e) {
  if (!dragging.value) return
  if (Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 5) moved = true
  pos.value = {
    x: clamp(e.clientX - dragStart.x, 4, window.innerWidth - 120),
    y: clamp(e.clientY - dragStart.y, 4, window.innerHeight - 150)
  }
}
function endDrag() {
  if (!dragging.value) return
  dragging.value = false
  window.removeEventListener('mousemove', onDrag)
  window.removeEventListener('mouseup', endDrag)
  if (pos.value) localStorage.setItem('cw_pet_pos', JSON.stringify(pos.value))
}

// ---------- 点击卖萌 ----------
function onClick() {
  if (moved) return
  jumping.value = true
  setTimeout(() => (jumping.value = false), 600)
  showPhrase(pickPhrase())
}
function showPhrase(text) {
  phrase.value = text
  clearTimeout(phraseTimer)
  phraseTimer = setTimeout(() => (phrase.value = ''), 4000)
}

// ---------- 通知提醒 ----------
async function checkNotifications(initial = false) {
  try {
    const r = await api.get('/notifications')
    const items = r.data.items || []
    const unread = r.data.unread || 0
    const prev = lastUnread
    lastUnread = unread
    unreadCount.value = unread
    if (!initial && unread > prev && prev >= 0 && unread > 0) {
      const newest = items.find(n => !n.read) || items[0]
      if (newest) {
        jumping.value = true
        setTimeout(() => (jumping.value = false), 600)
        showBubble(newest)
      }
    }
  } catch { /* 忽略 */ }
}
function showBubble(n) {
  const labelMap = { system: '系统', event: '活动', forum: '论坛', training: '培训', achievement: '成就' }
  bubble.value = {
    typeLabel: labelMap[n.type] || '通知',
    title: n.title || '',
    content: n.content || '',
  }
  clearTimeout(bubbleTimer)
  bubbleTimer = setTimeout(() => (bubble.value = null), 8000)
}
function goNotifications() {
  bubble.value = null
  router.push('/notifications')
}

onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem('cw_pet_pos'))
    if (saved && typeof saved.x === 'number') pos.value = saved
  } catch { /* 忽略 */ }
  checkNotifications(true)
  pollTimer = setInterval(() => checkNotifications(false), 45000)
})

onUnmounted(() => {
  clearInterval(pollTimer)
  clearTimeout(phraseTimer)
  clearTimeout(bubbleTimer)
  window.removeEventListener('mousemove', onDrag)
  window.removeEventListener('mouseup', endDrag)
})
</script>

<style scoped>
.pet {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 900;
  user-select: none;
  -webkit-user-select: none;
  cursor: grab;
}
.pet--dragging { cursor: grabbing; }

/* 已隐藏时的唤醒按钮 */
.pet-ghost {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 899;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 99px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: var(--c-text-secondary);
  font-size: 12px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  opacity: 0.85;
  transition: all 0.2s;
}
.pet-ghost:hover { opacity: 1; color: var(--c-primary); transform: translateY(-2px); }
.pet-ghost__paw { font-size: 16px; line-height: 1; }

/* 自定义按钮 */
.pet__gear {
  position: absolute;
  top: -6px;
  left: -6px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: rgba(255, 255, 255, 0.9);
  color: var(--c-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s, transform 0.2s;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  z-index: 2;
}
.pet:hover .pet__gear { opacity: 1; }
.pet__gear:hover { transform: rotate(45deg); color: var(--c-primary); }

/* 隐藏按钮 */
.pet__hide {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: rgba(255, 255, 255, 0.9);
  color: #ff453a;
  font-size: 12px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  z-index: 2;
}
.pet:hover .pet__hide { opacity: 1; }
.pet__hide:hover { background: #ff453a; color: #fff; }

/* 宠物浮动 */
.pet__cat {
  position: relative;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.18));
  animation: petFloat 3.2s ease-in-out infinite;
}
.pet--jump .pet__cat {
  animation: petJump 0.6s ease;
}

/* 未读角标 */
.pet__badge {
  position: absolute;
  top: -6px;
  right: -4px;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 99px;
  background: #ff453a;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 20px;
  text-align: center;
  box-shadow: 0 2px 6px rgba(255, 69, 58, 0.4);
  z-index: 2;
}

/* 气泡（fixed 定位由 bubbleStyle 计算，始终在桌宠头顶居中、不超出屏幕） */
.pet__bubble {
  position: absolute;
  width: 232px;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(10px) saturate(1.4);
  -webkit-backdrop-filter: blur(10px) saturate(1.4);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 14px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  padding: 10px 12px;
  z-index: 3;
}
.pet__bubble::after {
  content: '';
  position: absolute;
  bottom: -6px;
  left: var(--arrow-left, 50%);
  transform: translateX(-50%) rotate(45deg);
  width: 12px;
  height: 12px;
  background: rgba(255, 255, 255, 0.94);
  border-right: 1px solid rgba(0, 0, 0, 0.08);
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}
.pet__bubble--notify { cursor: pointer; }
.pet__bubble--notify:hover { background: #fff; }
.pet__bubble-type {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  color: var(--c-primary);
  background: var(--c-primary-light);
  border-radius: 99px;
  padding: 1px 8px;
  margin-bottom: 4px;
}
.pet__bubble-title {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--c-text);
  margin-bottom: 2px;
}
.pet__bubble-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 12px;
  color: var(--c-text-secondary);
}

/* 眨眼 / 尾巴 */
.pet-eye {
  transform-box: fill-box;
  transform-origin: center;
  animation: petBlink 4s infinite;
}
.pet-tail {
  transform-box: fill-box;
  transform-origin: 18px 104px;
  animation: petTailWag 3s ease-in-out infinite;
}
@keyframes petFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
@keyframes petJump {
  0% { transform: translateY(0); }
  30% { transform: translateY(-24px); }
  60% { transform: translateY(-14px); }
  100% { transform: translateY(0); }
}
/* 唤醒动画 */
.pet--wake .pet__cat { animation: petWake 0.85s cubic-bezier(0.22, 1, 0.36, 1); }
@keyframes petWake {
  0% { transform: translateY(44px) scale(0.3); opacity: 0; }
  55% { transform: translateY(-8px) scale(1.08); opacity: 1; }
  75% { transform: translateY(3px) scale(0.97); }
  100% { transform: translateY(0) scale(1); }
}
@keyframes petBlink {
  0%, 90%, 100% { transform: scaleY(1); }
  94% { transform: scaleY(0.08); }
}
@keyframes petTailWag {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(9deg); }
}
.bubble-enter-active, .bubble-leave-active { transition: all 0.25s ease; }
.bubble-enter-from, .bubble-leave-to { opacity: 0; transform: translateY(8px) scale(0.92); }

/* ===== 自定义面板 ===== */
.pet-panel-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
}
.pet-panel {
  width: min(720px, 94vw);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.pet-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--glass-border);
}
.pet-panel__header h3 { font-size: 17px; font-weight: 700; }
.pet-panel__close {
  width: 28px; height: 28px;
  border-radius: 50%;
  border: 1px solid var(--glass-border);
  background: transparent;
  color: var(--c-text-secondary);
  cursor: pointer;
  font-size: 13px;
}
.pet-panel__close:hover { background: var(--c-bg); color: var(--c-text); }
.pet-panel__body {
  flex: 1;
  overflow: auto;
  padding: 20px;
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 20px;
}

/* 自定义对话 */
.pet-phrases__row { display: flex; gap: 8px; }
.pet-phrases__row .input { flex: 1; min-width: 0; }
.pet-phrases__fb { margin-top: 6px; font-size: 12px; font-weight: 600; }
.pet-phrases__fb--ok { color: #10b981; }
.pet-phrases__fb--fail { color: #ef4444; }
.pet-phrases__list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
}
.pet-phrases__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 8px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  font-size: 13px;
  color: var(--c-text-secondary);
}
.pet-phrases__text { flex: 1; min-width: 0; word-break: break-all; }
.pet-phrases__del {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 50%;
  background: rgba(0,0,0,0.06);
  color: #999;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all .15s;
}
.pet-phrases__del:hover { background: #ff453a; color: #fff; }
.pet-panel__preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.pet-panel__preview-stage {
  width: 100%;
  border: 1px dashed var(--glass-border-strong);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px 0;
}
.pet-panel__name { font-size: 14px; font-weight: 600; color: var(--c-text-secondary); }
.pet-panel__random { width: 100%; margin-top: 2px; }
.pet-panel__controls { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
.pet-panel__section {}
.pet-panel__label { font-size: 12px; font-weight: 600; color: var(--c-text-muted); margin-bottom: 8px; letter-spacing: 0.02em; }

.pet-presets {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
}
.pet-preset {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 4px 6px;
  border: 1.5px solid var(--glass-border);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: all 0.15s;
}
.pet-preset span { font-size: 11px; color: var(--c-text-secondary); }
.pet-preset:hover { transform: translateY(-2px); border-color: var(--c-primary); }
.pet-preset--active { border-color: var(--c-primary); background: var(--c-primary-light); box-shadow: 0 0 0 2px rgba(0, 113, 227, 0.12); }
.pet-preset--active span { color: var(--c-primary); font-weight: 600; }

.pet-colors { display: flex; flex-wrap: wrap; gap: 8px; }
.pet-color {
  width: 26px; height: 26px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.12);
  cursor: pointer;
  padding: 0;
  position: relative;
}
.pet-color--active { box-shadow: 0 0 0 2px var(--c-primary); }
.pet-color--custom { overflow: hidden; background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red); }
.pet-color--custom input {
  position: absolute;
  inset: -6px;
  opacity: 0;
  cursor: pointer;
}

.pet-accessories { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
.pet-accessory {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 2px 4px;
  border: 1.5px solid var(--glass-border);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: all 0.15s;
}
.pet-accessory span { font-size: 11px; color: var(--c-text-secondary); }
.pet-accessory:hover { transform: translateY(-2px); border-color: var(--c-primary); }
.pet-accessory--active { border-color: var(--c-primary); background: var(--c-primary-light); }
.pet-accessory--active span { color: var(--c-primary); font-weight: 600; }

.pet-panel__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--glass-border);
}
.pet-panel__footer-spacer { flex: 1; }
.pet-panel__switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}
.pet-panel__switch input { display: none; }
.pet-panel__switch-slider {
  width: 36px;
  height: 20px;
  border-radius: 99px;
  background: rgba(0, 0, 0, 0.15);
  position: relative;
  transition: background 0.2s;
}
.pet-panel__switch-slider::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  transition: transform 0.2s;
}
.pet-panel__switch input:checked + .pet-panel__switch-slider { background: var(--c-primary); }
.pet-panel__switch input:checked + .pet-panel__switch-slider::after { transform: translateX(16px); }
.pet-panel__switch-label { font-size: 13px; color: var(--c-text-secondary); }

@media (max-width: 640px) {
  .pet-panel__body { grid-template-columns: 1fr; }
  .pet-presets { grid-template-columns: repeat(5, 1fr); }
  .pet-accessories { grid-template-columns: repeat(4, 1fr); }
}

/* 小屏隐藏宠物本体 */
@media (max-width: 768px) {
  .pet { display: none; }
  .pet-ghost { display: none; }
}
</style>

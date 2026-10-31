<template>
  <div
    class="apt-toolbar"
    :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
  >
      <div class="apt-toolbar-handle" title="拖动工具栏" @mousedown.prevent="startAptToolbarDrag">⋮⋮</div>
      <!-- 道路类：绘制跑道/滑行道（hover 垂直弹出，移出 500ms 防抖收起） -->
      <div class="apt-drop" @mouseenter="aptDropEnter(0)" @mouseleave="aptDropLeave(0)">
        <button class="apt-toolbar-btn apt-drop-trigger" title="道路类：绘制跑道/滑行道">
          <svg viewBox="0 0 24 24" width="17" height="17"><path fill="currentColor" d="M2 8h20v3H2V8zm0 5h20v3H2v-3z"/></svg>
          <span>道路类</span><span class="apt-drop-caret">▾</span>
        </button>
        <div class="apt-drop-menu" :class="{ open: aptDropOpen === 0 }">
          <button class="apt-toolbar-btn apt-drop-item" :class="{ active: aptToolMode === 'add-runway' }" title="绘制跑道（单击加点，双击结束）" @click="onToggleTool('add-runway')">
            <svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M2 8h20v3H2V8zm0 5h20v3H2v-3z"/></svg>跑道
          </button>
          <button class="apt-toolbar-btn apt-drop-item" :class="{ active: aptToolMode === 'add-taxi' }" title="绘制滑行道（单击加点，双击结束）" @click="onToggleTool('add-taxi')">
            <svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M4 20l6-6-2.5-2.5L4 15V20zm7.5-9.5L14 8l2 2-2.5 2.5L16 15l4-4-7-7-4 4 2.5 2.5z"/></svg>滑行道
          </button>
        </div>
      </div>
      <!-- 标签类：放置编号标签 -->
      <div class="apt-drop" @mouseenter="aptDropEnter(1)" @mouseleave="aptDropLeave(1)">
        <button class="apt-toolbar-btn apt-drop-trigger" title="标签类：放置编号标签">
          <svg viewBox="0 0 24 24" width="17" height="17"><path fill="currentColor" d="M4 4h9l7 7-9 9-7-7V4zm4 3a1.5 1.5 0 100 3 1.5 1.5 0 000-3z"/></svg>
          <span>标签类</span><span class="apt-drop-caret">▾</span>
        </button>
        <div class="apt-drop-menu" :class="{ open: aptDropOpen === 1 }">
          <button class="apt-toolbar-btn apt-drop-item" :class="{ active: aptToolMode === 'add-runway-label' }" title="放置跑道编号标签" @click="onToggleTool('add-runway-label')">
            <svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M2 8h20v3H2V8zm0 5h20v3H2v-3z"/></svg>跑道
          </button>
          <button class="apt-toolbar-btn apt-drop-item" :class="{ active: aptToolMode === 'add-taxi-label' }" title="放置滑行道编号标签" @click="onToggleTool('add-taxi-label')">
            <svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M4 20l6-6-2.5-2.5L4 15V20zm7.5-9.5L14 8l2 2-2.5 2.5L16 15l4-4-7-7-4 4 2.5 2.5z"/></svg>滑行道
          </button>
          <button class="apt-toolbar-btn apt-drop-item" :class="{ active: aptToolMode === 'add-stand' }" title="放置停机位标签" @click="onToggleTool('add-stand')">
            <svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M12 2a3 3 0 013 3c0 1.3-.84 2.4-2 2.82V9h4a2 2 0 010 4h-4v7a1 1 0 01-2 0v-7H7a2 2 0 010-4h4V7.82A3.001 3.001 0 0112 2z"/></svg>停机位
          </button>
        </div>
      </div>
      <!-- 区域类：放置区域标记 -->
      <div class="apt-drop" @mouseenter="aptDropEnter(2)" @mouseleave="aptDropLeave(2)">
        <button class="apt-toolbar-btn apt-drop-trigger" title="区域类：放置区域标记">
          <svg viewBox="0 0 24 24" width="17" height="17"><path fill="currentColor" d="M4 5h16v14H4V5zm2 2v10h12V7H6z"/></svg>
          <span>区域类</span><span class="apt-drop-caret">▾</span>
        </button>
        <div class="apt-drop-menu" :class="{ open: aptDropOpen === 2 }">
          <button class="apt-toolbar-btn apt-drop-item" :class="{ active: aptToolMode === 'add-area-gnd' }" title="放置地面区域标记" @click="onToggleTool('add-area-gnd')">地面区域</button>
          <button class="apt-toolbar-btn apt-drop-item" :class="{ active: aptToolMode === 'add-area-apron' }" title="放置机坪区域标记" @click="onToggleTool('add-area-apron')">机坪区域</button>
          <button class="apt-toolbar-btn apt-drop-item" :class="{ active: aptToolMode === 'add-area-tower' }" title="放置塔台区域标记" @click="onToggleTool('add-area-tower')">塔台区域</button>
        </div>
      </div>
      <button class="apt-toolbar-btn apt-toolbar-submit" title="提交到服务器" @click="$emit('submit')">
        <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 3l-6 6h4v6h4V9h4l-6-6zm-6 14h12v2H6v-2z"/></svg>
      </button>
      <button class="apt-toolbar-btn apt-toolbar-cancel" title="取消所有修改" @click="$emit('cancel')">
        <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </button>
    </div>
</template>

<script setup>
/**
 * AirportEditToolbar —— 机场编辑悬浮工具栏（可拖动，深浅色自适应）
 *
 * props:
 *  - aptToolMode  当前工具模式（null | 'add-runway' | 'add-taxi' | 'add-runway-label' |
 *                 'add-taxi-label' | 'add-stand' | 'add-area-*'），用于按钮 active 高亮
 *  - pos          工具栏固定定位坐标 { x, y }（由编辑器持有，组件卸载重开位置不丢，保持原行为）
 * emits:
 *  - update:pos({x,y})  拖动工具栏时上报新位置
 *  - toggle-tool(mode)  切换绘制/放置工具（父组件调用编辑器 toggleAptToolMode）
 *  - submit             提交到服务器（编辑器 aptEditSubmit）
 *  - cancel             取消所有修改（编辑器 aptEditCancel）
 * 副作用：window mousemove/mouseup 拖动监听（mouseup 时自解绑）、下拉收起 500ms 定时器；
 *         组件卸载时清理定时器。
 */
import { onUnmounted, ref } from 'vue'

const props = defineProps({
  aptToolMode: { type: String, default: null },
  pos: { type: Object, required: true },
})
const emit = defineEmits(['toggle-tool', 'submit', 'cancel', 'update:pos'])

// 下拉分组展开/收起：移出后 500ms 防抖隐藏
const aptDropOpen = ref(null)   // 当前展开的分组索引 0/1/2
let aptDropTimer = null
function aptDropEnter(i) {
  clearTimeout(aptDropTimer)
  aptDropOpen.value = i
}
function aptDropLeave(i) {
  clearTimeout(aptDropTimer)
  aptDropTimer = setTimeout(() => { if (aptDropOpen.value === i) aptDropOpen.value = null }, 500)
}

/** 工具栏拖动手柄：拖动过程中实时上报位置（父组件写回编辑器持有的 pos） */
function startAptToolbarDrag(e) {
  const startX = e.clientX - props.pos.x
  const startY = e.clientY - props.pos.y
  const onMove = (ev) => {
    emit('update:pos', {
      x: Math.max(0, Math.min(window.innerWidth - 60, ev.clientX - startX)),
      y: Math.max(0, Math.min(window.innerHeight - 60, ev.clientY - startY)),
    })
  }
  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function onToggleTool(mode) { emit('toggle-tool', mode) }

onUnmounted(() => {
  if (aptDropTimer) { clearTimeout(aptDropTimer); aptDropTimer = null }
})
</script>

<style scoped>
/* ===== 机场编辑悬浮工具栏（深浅色自适应）===== */
.apt-toolbar {
  position: fixed;
  z-index: 2200;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 7px;
  border-radius: 10px;
  background: rgba(255, 255, 255, .92);
  border: 1px solid rgba(0, 0, 0, .12);
  box-shadow: 0 6px 20px rgba(0, 0, 0, .18);
  backdrop-filter: blur(8px);
  user-select: none;
}
html[data-theme='dark'] .apt-toolbar {
  background: rgba(28, 32, 42, .92);
  border-color: rgba(255, 255, 255, .1);
  box-shadow: 0 6px 20px rgba(0, 0, 0, .5);
}
.apt-toolbar-handle {
  cursor: grab;
  padding: 0 5px;
  font-size: 11px;
  letter-spacing: -2px;
  color: #9ca3af;
  line-height: 1.4;
}
html[data-theme='dark'] .apt-toolbar-handle { color: #6b7280; }
.apt-toolbar-handle:active { cursor: grabbing; }
.apt-toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--c-text, #374151);
  cursor: pointer;
  transition: background .15s ease, color .15s ease, border-color .15s ease;
}
.apt-toolbar-btn:hover {
  background: rgba(23, 105, 210, .1);
  color: var(--c-primary, #1769d2);
}
/* 激活态：主色实底白图标 */
.apt-toolbar-btn.active {
  background: var(--c-primary, #1769d2);
  color: #fff;
  border-color: var(--c-primary);
}
/* 确认/取消语义色 */
.apt-toolbar-ok:hover { background: rgba(34, 197, 94, .14); color: #16a34a; }
.apt-toolbar-cancel:hover { background: rgba(239, 68, 68, .14); color: #dc2626; }
/* 下拉分组（道路类/标签类/区域类）：hover 垂直动画弹出 */
.apt-drop { position: relative; }
.apt-drop-trigger {
  width: auto;
  padding: 0 8px;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.apt-drop-caret { font-size: 9px; opacity: .7; }
.apt-drop-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 2300;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 132px;
  padding: 6px;
  border-radius: 10px;
  background: rgba(255, 255, 255, .96);
  border: 1px solid rgba(0, 0, 0, .12);
  box-shadow: 0 8px 24px rgba(0, 0, 0, .18);
  backdrop-filter: blur(8px);
  opacity: 0;
  transform: translateY(-8px);
  pointer-events: none;
  transition: opacity .18s ease, transform .18s ease;
}
.apt-drop-menu.open {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}
.apt-drop-item {
  width: 100%;
  justify-content: flex-start;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  padding: 0 8px;
}
html[data-theme='dark'] .apt-drop-menu {
  background: rgba(28, 32, 42, .96);
  border-color: rgba(255, 255, 255, .1);
  box-shadow: 0 8px 24px rgba(0, 0, 0, .5);
}
/* 深色主题 */
html[data-theme='dark'] .apt-toolbar-btn { color: #cbd5e1; }
html[data-theme='dark'] .apt-toolbar-btn:hover {
  background: rgba(138, 180, 255, .14);
  color: #8ab4ff;
}
html[data-theme='dark'] .apt-toolbar-btn.active {
  background: rgba(138, 180, 255, .25);
  color: #cfe0ff;
  border-color: rgba(138, 180, 255, .55);
}
html[data-theme='dark'] .apt-toolbar-ok:hover { background: rgba(34, 197, 94, .2); color: #4ade80; }
html[data-theme='dark'] .apt-toolbar-cancel:hover { background: rgba(239, 68, 68, .2); color: #f87171; }
</style>

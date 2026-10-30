<script setup>
// 参数化宠物渲染器：根据 config（type/color/belly/accessory）绘制 SVG 萌宠
import { computed } from 'vue'

const props = defineProps({
  config: { type: Object, required: true },
  size: { type: Number, default: 96 }
})

let uid = 0
function shade(hex, amt) {
  try {
    const n = parseInt(String(hex).replace('#', ''), 16)
    if (Number.isNaN(n)) return hex
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
    r = Math.min(255, Math.max(0, r + amt))
    g = Math.min(255, Math.max(0, g + amt))
    b = Math.min(255, Math.max(0, b + amt))
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
  } catch { return hex }
}
const gradId = 'petGrad' + (++uid)

const type = computed(() => props.config.type || 'cat')
const color = computed(() => props.config.color || '#f6a63a')
const belly = computed(() => props.config.belly || '#ffe9c7')
const accessory = computed(() => props.config.accessory || 'none')
const darker = computed(() => type.value === 'panda' ? '#2b2b2b' : shade(color.value, -26))
const lighter = computed(() => shade(color.value, 20))
const outline = 'rgba(0,0,0,0.15)'
const blush = '#ffcfc4'
const pink = '#f4a7b9'

// 耳朵形态
const earKind = computed(() => ({
  cat: 'point', fox: 'fox', bunny: 'long', bear: 'round',
  panda: 'round', dog: 'floppy', frog: 'bump', hamster: 'round',
  penguin: 'none', chick: 'none'
}[type.value] || 'point'))

// 尾巴形态
const tailKind = computed(() => ({
  cat: 'curl', dog: 'curl', fox: 'bushy', bunny: 'ball', hamster: 'none'
}[type.value] || 'none'))

// 鼻子/嘴形态
const noseKind = computed(() => ({
  cat: 'triangle', fox: 'triangle', bear: 'round', panda: 'round',
  dog: 'round', hamster: 'tiny', bunny: 'tiny', penguin: 'beak',
  chick: 'beak', frog: 'wide'
}[type.value] || 'triangle'))

const hasWhiskers = computed(() => ['cat', 'fox', 'hamster'].includes(type.value))
const pandaPatches = computed(() => type.value === 'panda')
const penguinFace = computed(() => type.value === 'penguin')
</script>

<template>
  <svg :viewBox="'0 0 140 150'" :width="size" :height="Math.round(size * 1.07)" aria-hidden="true" class="pet-figure">
    <defs>
      <linearGradient :id="gradId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" :stop-color="lighter" />
        <stop offset="100%" :stop-color="color" />
      </linearGradient>
    </defs>

    <!-- ===== 尾巴 ===== -->
    <g v-if="tailKind !== 'none'" class="pet-tail">
      <path v-if="tailKind === 'curl'"
            d="M22 118 C6 118 4 96 14 88 C20 83 26 88 24 94"
            fill="none" :stroke="darker" stroke-width="10" stroke-linecap="round"/>
      <path v-else-if="tailKind === 'bushy'"
            d="M24 120 C2 116 0 94 16 86 C28 79 34 88 30 98 C36 92 34 80 22 80"
            :fill="color" stroke="none"/>
      <circle v-else-if="tailKind === 'ball'" cx="22" cy="116" r="13" :fill="color"/>
    </g>

    <!-- ===== 身体 ===== -->
    <ellipse cx="70" cy="112" rx="40" ry="32" :fill="'url(#' + gradId + ')'" :stroke="outline" stroke-width="2.5"/>
    <ellipse cx="70" cy="119" rx="24" ry="21" :fill="belly" opacity="0.95"/>
    <ellipse cx="52" cy="136" rx="11" ry="7" :fill="color"/>
    <ellipse cx="88" cy="136" rx="11" ry="7" :fill="color"/>

    <!-- ===== 耳朵 ===== -->
    <!-- 尖耳：猫 -->
    <template v-if="earKind === 'point'">
      <path d="M32 46 L26 16 L56 34 Z" :fill="color" :stroke="outline" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M108 46 L114 16 L84 34 Z" :fill="color" :stroke="outline" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M36 42 L33 24 L50 35 Z" fill="#f6c6d0"/>
      <path d="M104 42 L107 24 L90 35 Z" fill="#f6c6d0"/>
    </template>
    <!-- 尖耳：狐狸（更高更大+深色耳尖） -->
    <template v-else-if="earKind === 'fox'">
      <path d="M28 44 L16 8 L54 30 Z" :fill="color" :stroke="outline" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M112 44 L124 8 L86 30 Z" :fill="color" :stroke="outline" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M28 44 L20 20 L34 30 Z" :fill="darker"/>
      <path d="M112 44 L120 20 L106 30 Z" :fill="darker"/>
    </template>
    <!-- 长耳：兔子 -->
    <template v-else-if="earKind === 'long'">
      <ellipse cx="44" cy="22" rx="11" ry="25" :fill="color" :stroke="outline" stroke-width="2.5"/>
      <ellipse cx="96" cy="22" rx="11" ry="25" :fill="color" :stroke="outline" stroke-width="2.5"/>
      <ellipse cx="44" cy="25" rx="6" ry="17" fill="#f6c6d0"/>
      <ellipse cx="96" cy="25" rx="6" ry="17" fill="#f6c6d0"/>
    </template>
    <!-- 圆耳：熊/熊猫 -->
    <template v-else-if="earKind === 'round'">
      <circle cx="40" cy="32" r="14" :fill="type === 'panda' ? '#2b2b2b' : color" :stroke="outline" stroke-width="2.5"/>
      <circle cx="100" cy="32" r="14" :fill="type === 'panda' ? '#2b2b2b' : color" :stroke="outline" stroke-width="2.5"/>
      <circle cx="40" cy="32" r="7" :fill="type === 'panda' ? '#3c3c3c' : belly"/>
      <circle cx="100" cy="32" r="7" :fill="type === 'panda' ? '#3c3c3c' : belly"/>
    </template>
    <!-- 垂耳：狗 -->
    <template v-else-if="earKind === 'floppy'">
      <path d="M30 40 Q22 62 34 76 Q46 70 42 48 Z" :fill="darker" :stroke="outline" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M110 40 Q118 62 106 76 Q94 70 98 48 Z" :fill="darker" :stroke="outline" stroke-width="2.5" stroke-linejoin="round"/>
    </template>
    <!-- 小鼓包：青蛙 -->
    <template v-else-if="earKind === 'bump'">
      <circle cx="46" cy="30" r="9" :fill="color" :stroke="outline" stroke-width="2.5"/>
      <circle cx="94" cy="30" r="9" :fill="color" :stroke="outline" stroke-width="2.5"/>
    </template>

    <!-- ===== 头 ===== -->
    <!-- 企鹅：白色脸面 -->
    <ellipse v-if="penguinFace" cx="70" cy="62" rx="30" ry="24" :fill="belly"/>
    <ellipse cx="70" cy="58" rx="42" ry="34" :fill="'url(#' + gradId + ')'" :stroke="outline" stroke-width="2.5"/>

    <!-- 腮红 -->
    <ellipse cx="48" cy="70" rx="10" ry="7" :fill="blush"/>
    <ellipse cx="92" cy="70" rx="10" ry="7" :fill="blush"/>

    <!-- 熊猫眼斑 -->
    <template v-if="pandaPatches">
      <ellipse cx="54" cy="55" rx="10" ry="12" fill="#2b2b2b"/>
      <ellipse cx="86" cy="55" rx="10" ry="12" fill="#2b2b2b"/>
    </template>

    <!-- 眼睛 -->
    <ellipse class="pet-eye" cx="54" cy="54" rx="5.5" ry="8" :fill="penguinFace ? '#2b2b2b' : '#33251f'"/>
    <ellipse class="pet-eye" cx="86" cy="54" rx="5.5" ry="8" :fill="penguinFace ? '#2b2b2b' : '#33251f'"/>
    <ellipse cx="56" cy="51" rx="1.7" ry="2.6" fill="#fff"/>
    <ellipse cx="88" cy="51" rx="1.7" ry="2.6" fill="#fff"/>

    <!-- 鼻子 -->
    <path v-if="noseKind === 'triangle'" d="M66 62 L74 62 L70 66.5 Z" fill="#d9776b"/>
    <ellipse v-else-if="noseKind === 'round'" cx="70" cy="64" rx="4.5" ry="3.6" fill="#4a3b33"/>
    <path v-else-if="noseKind === 'tiny'" d="M68 61 L72 61 L70 64.5 Z" :fill="pink"/>
    <path v-else-if="noseKind === 'beak'" d="M64 61 L76 61 L70 72 Z" fill="#f6a33c" :stroke="outline" stroke-width="1.5" stroke-linejoin="round"/>
    <template v-else-if="noseKind === 'wide'">
      <circle cx="67" cy="63.5" r="1.9" fill="#3c6e34"/>
      <circle cx="73" cy="63.5" r="1.9" fill="#3c6e34"/>
    </template>

    <!-- 嘴（微笑） -->
    <path v-if="noseKind !== 'beak' && noseKind !== 'wide'"
          d="M62 70 Q70 76 78 70" fill="none" stroke="#6b4a34" stroke-width="2" stroke-linecap="round"/>
    <path v-else-if="noseKind === 'wide'"
          d="M64 69 Q70 74 76 69" fill="none" stroke="#3c6e34" stroke-width="2" stroke-linecap="round"/>

    <!-- 胡须 -->
    <g v-if="hasWhiskers" stroke="#8a6a45" stroke-width="1.4" stroke-linecap="round" opacity="0.65">
      <line x1="40" y1="62" x2="22" y2="58"/>
      <line x1="40" y1="68" x2="20" y2="70"/>
      <line x1="100" y1="62" x2="118" y2="58"/>
      <line x1="100" y1="68" x2="120" y2="70"/>
    </g>

    <!-- ===== 配饰 ===== -->
    <!-- 机长帽 -->
    <g v-if="accessory === 'pilot'">
      <path d="M38 32 Q40 16 70 14 Q100 16 102 32 Z" fill="#2f4b7c"/>
      <path d="M34 32 L106 32 L104 39 L36 39 Z" fill="#2f4b7c"/>
      <ellipse cx="70" cy="30" rx="6" ry="5" fill="#ffd34e"/>
    </g>
    <!-- 礼帽 -->
    <g v-else-if="accessory === 'hat'">
      <rect x="52" y="4" width="36" height="26" rx="4" fill="#2b2b2b"/>
      <rect x="42" y="28" width="56" height="8" rx="4" fill="#2b2b2b"/>
      <rect x="52" y="24" width="36" height="5" fill="#c0392b"/>
    </g>
    <!-- 蝴蝶结 -->
    <g v-else-if="accessory === 'bow'" transform="translate(40 24)">
      <path d="M0 0 Q-13 -9 -11 -2 Q-9 7 0 3 Z" fill="#f472b6"/>
      <path d="M0 0 Q13 -9 11 -2 Q9 7 0 3 Z" fill="#ec4899"/>
      <circle cx="0" cy="1" r="3.2" fill="#be185d"/>
    </g>
    <!-- 围巾 -->
    <g v-else-if="accessory === 'scarf'">
      <path d="M42 90 Q70 102 98 90 L94 102 Q70 112 46 102 Z" fill="#e63946"/>
      <path d="M84 98 L92 120 L78 118 Z" fill="#d62839"/>
      <path d="M88 104 L90 114 L86 114 Z" fill="#b01e2e"/>
    </g>
    <!-- 眼镜 -->
    <g v-else-if="accessory === 'glasses'">
      <circle cx="54" cy="54" r="9" fill="rgba(140,180,255,0.10)" stroke="#333" stroke-width="2.5"/>
      <circle cx="86" cy="54" r="9" fill="rgba(140,180,255,0.10)" stroke="#333" stroke-width="2.5"/>
      <line x1="63" y1="54" x2="77" y2="54" stroke="#333" stroke-width="2.5"/>
    </g>
    <!-- 耳机 -->
    <g v-else-if="accessory === 'headset'">
      <path d="M42 42 Q70 14 98 42" fill="none" stroke="#2f4b7c" stroke-width="6" stroke-linecap="round"/>
      <rect x="31" y="42" width="14" height="24" rx="7" fill="#2f4b7c"/>
      <rect x="95" y="42" width="14" height="24" rx="7" fill="#2f4b7c"/>
      <path d="M104 60 Q114 62 112 74" fill="none" stroke="#2f4b7c" stroke-width="4" stroke-linecap="round"/>
    </g>
  </svg>
</template>

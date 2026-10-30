/**
 * 页面级安全埋点（证据链：还原页面浏览时间线 / 确认同一设备）
 *
 * - 设备指纹：localStorage `cw_device_fp`，同一浏览器全局一致，是 LoginLog / SecurityEvent / User.registerFp 的关联键
 * - 追踪像素：首屏 + 每次 SPA 路由变化请求 /api/security/pixel.gif，携带
 *     _ref  = 当前路径（页面标识）
 *     _fp   = 设备指纹（<img> 无法带自定义头，故走查询参数）
 *     _uid  = 登录用户 CID
 *     _net  = 网络信息 effectiveType|downlink|rtt|saveData
 * - SSID 说明：浏览器无标准 Web API 读取 WiFi SSID/BSSID。
 *   此处尽力采集 Network Information API；真正的 SSID 需由原生客户端/浏览器扩展
 *   调用 POST /api/security/network-info 回填（见 reportNetworkInfo）。
 */

const FP_KEY = 'cw_device_fp'   // 兼容旧键：纯 fp（未签名），供 pixel 等同步场景使用
const DEV_KEY = 'cw_device'     // 签名设备 token：{ fp, sig, issued }（L1，服务端签发）

/** 读取已缓存的签名设备（无则 null） */
function readDevice() {
  try {
    const raw = localStorage.getItem(DEV_KEY)
    if (!raw) return null
    const d = JSON.parse(raw)
    if (d && d.fp && d.sig) return d
    return null
  } catch {
    return null
  }
}

/** 同步读取设备指纹（优先签名设备；未就绪时回退旧随机串，保证 pixel 等同步调用可用） */
export function getDeviceFp() {
  try {
    const dev = readDevice()
    if (dev) return dev.fp
    let fp = localStorage.getItem(FP_KEY)
    if (!fp) {
      fp = 'fp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12)
      localStorage.setItem(FP_KEY, fp)
    }
    return fp
  } catch {
    return ''
  }
}

/** 同步读取设备签名（无签名返回空串） */
export function getDeviceSig() {
  const dev = readDevice()
  return dev ? dev.sig : ''
}

/** 同步读取设备签发时间戳（无返回 0） */
export function getDeviceIssued() {
  const dev = readDevice()
  return dev ? dev.issued : 0
}

// 并发去重：多个调用方共享同一次初始化
let deviceInitPromise = null

/**
 * 确保已获取服务端签名设备指纹（L1）。
 * @param {boolean} force 强制重新初始化（验签失败后调用）
 * @returns {Promise<{fp:string,sig:string,issued:number}|null>}
 */
export async function ensureDevice(force = false) {
  if (typeof window === 'undefined') return null
  const cached = readDevice()
  if (cached && !force) return cached
  if (deviceInitPromise) return deviceInitPromise
  deviceInitPromise = (async () => {
    try {
      // 采集真浏览器指纹信号（仅用于服务端关联/去重基线，不单独作为判定依据）
      let signals = ''
      try { signals = await computeSignals() } catch { /* ignore */ }
      const res = await fetch('/api/security/device-init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signals })
      })
      const data = await res.json()
      if (data && data.success && data.data) {
        const dev = { fp: data.data.fp, sig: data.data.sig, issued: data.data.issued, createdAt: Date.now() }
        try {
          localStorage.setItem(DEV_KEY, JSON.stringify(dev))
          localStorage.setItem(FP_KEY, dev.fp) // 同步到兼容键
        } catch { /* ignore */ }
        return dev
      }
      return null
    } finally {
      deviceInitPromise = null
    }
  })()
  return deviceInitPromise
}

/** 简易字符串哈希（crypto.subtle 不可用时回退 FNV-1a） */
async function hexHash(str) {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
    }
  } catch { /* fall through */ }
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return ('0000000' + (h >>> 0).toString(16)).slice(-8)
}

function canvasSig() {
  const c = document.createElement('canvas')
  c.width = 240; c.height = 60
  const ctx = c.getContext('2d')
  if (!ctx) return 'no-canvas'
  ctx.textBaseline = 'top'
  ctx.font = '14px Arial'
  ctx.fillStyle = '#f60'
  ctx.fillRect(0, 0, 240, 60)
  ctx.fillStyle = '#069'
  ctx.fillText('CWFLY-设备指纹-测试', 2, 15)
  ctx.fillStyle = 'rgba(102, 204, 0, 0.7)'
  ctx.fillText('指纹防伪 v2', 4, 34)
  return c.toDataURL().slice(0, 200)
}

function webglSig() {
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
  if (!gl) return 'no-webgl'
  const dbg = gl.getExtension('WEBGL_debug_renderer_info')
  const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
  const vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)
  return `${vendor}|${renderer}`
}

function fontSig() {
  const probes = ['monospace', 'serif', 'sans-serif', 'Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Verdana', 'Tahoma', 'Comic Sans MS']
  const found = []
  try {
    if (document.fonts && document.fonts.check) {
      for (const f of probes) {
        try { if (document.fonts.check(`12px "${f}"`)) found.push(f) } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
  return found.join(',')
}

/** 采集真浏览器指纹信号并哈希（L2：提高伪造成本，需配合后端签名 token 使用） */
export async function computeSignals() {
  const parts = []
  try { parts.push('canvas:' + canvasSig()) } catch { /* ignore */ }
  try { parts.push('webgl:' + webglSig()) } catch { /* ignore */ }
  try { parts.push('screen:' + screen.width + 'x' + screen.height + 'x' + (screen.colorDepth || '')) } catch { /* ignore */ }
  try { parts.push('dpr:' + (window.devicePixelRatio || '')) } catch { /* ignore */ }
  try { parts.push('tz:' + (Intl.DateTimeFormat().resolvedOptions().timeZone || '')) } catch { /* ignore */ }
  try { parts.push('cores:' + (navigator.hardwareConcurrency || '')) } catch { /* ignore */ }
  try { parts.push('langs:' + ((navigator.languages || []).join(','))) } catch { /* ignore */ }
  try { parts.push('platform:' + (navigator.platform || '')) } catch { /* ignore */ }
  try { parts.push('fonts:' + fontSig()) } catch { /* ignore */ }
  return 'sig-' + (await hexHash(parts.join('|')))
}

/**
 * Proof-of-Work 求解（L4）：算 SHA-256 前缀哈希，与后端 services/deviceFp.js verifyPow 算法一致。
 * @returns {Promise<{challenge:string,nonce:number,difficulty:number,sig:string}>}
 */
export async function solvePow(difficulty, challenge, sig) {
  const encoder = new TextEncoder()
  const fullChars = Math.floor(difficulty / 4)
  const remBits = difficulty % 4
  for (let nonce = 0; nonce < 100000000; nonce++) {
    const buf = await crypto.subtle.digest('SHA-256', encoder.encode(`${challenge}|${nonce}`))
    const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
    if (!hex.startsWith('0'.repeat(fullChars))) continue
    if (remBits > 0) {
      const nibble = parseInt(hex[fullChars], 16)
      if ((nibble >> (4 - remBits)) !== 0) continue
    }
    return { challenge, nonce, difficulty, sig }
  }
  throw new Error('工作量证明计算超时')
}

/** 获取新 PoW 挑战并求解（供注册前端调用） */
export async function fetchAndSolvePow() {
  const res = await fetch('/api/security/pow-challenge', { method: 'POST' })
  const data = await res.json()
  if (!data || !data.success || !data.data) throw new Error('获取工作量证明失败')
  const { challenge, difficulty, sig } = data.data
  return solvePow(difficulty, challenge, sig)
}

/** 获取当前登录用户 CID（localStorage cw_user 中的 cid 字段） */
export function getLoggedInCid() {
  try {
    const raw = localStorage.getItem('cw_user')
    if (!raw) return ''
    const u = JSON.parse(raw)
    return (u && u.cid) || ''
  } catch {
    return ''
  }
}

/** 网络信息（尽力而为；SSID 浏览器不可读） */
function getNetworkInfo() {
  try {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection
    if (!c) return ''
    const saveData = c.saveData ? 1 : 0
    return [c.effectiveType || '', c.downlink ?? '', c.rtt ?? '', saveData].join('|')
  } catch {
    return ''
  }
}

/** 触发一次追踪像素请求（1×1 透明 GIF，不阻塞页面） */
function firePixel(ref) {
  try {
    const fp = getDeviceFp()
    if (!fp) return
    const params = new URLSearchParams()
    if (ref) params.set('_ref', String(ref).slice(0, 500))
    params.set('_fp', fp)
    const uid = getLoggedInCid()
    if (uid) params.set('_uid', uid)
    const net = getNetworkInfo()
    if (net) params.set('_net', net)
    const img = new Image()
    img.src = `/api/security/pixel.gif?${params.toString()}`
  } catch { /* 埋点失败不应影响页面 */ }
}

/**
 * 上报网络信息（含 SSID/BSSID）——供原生客户端/浏览器扩展等可信来源调用，
 * 以设备指纹为关联键回填证据链。Web 页面本身无法获取 SSID。
 * @param {{ssid?: string, bssid?: string}} info
 */
export async function reportNetworkInfo(info = {}) {
  try {
    await fetch('/api/security/network-info', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Fp': getDeviceFp()
      },
      body: JSON.stringify(info)
    })
  } catch { /* ignore */ }
}

/** 初始化页面追踪：首屏 + SPA 路由变化 + 标签页回前台 */
export function initPageTracking() {
  if (typeof window === 'undefined') return
  const fire = () => firePixel(window.location.pathname + window.location.search)

  fire() // 首屏

  // SPA 路由变化（vue-router history 模式底层走 pushState/replaceState）
  try {
    const origPush = history.pushState
    history.pushState = function (...args) {
      const ret = origPush.apply(this, args)
      fire()
      return ret
    }
    const origReplace = history.replaceState
    history.replaceState = function (...args) {
      const ret = origReplace.apply(this, args)
      fire()
      return ret
    }
  } catch { /* ignore */ }

  window.addEventListener('popstate', fire)
  window.addEventListener('hashchange', fire)

  // 标签页回到前台时补一次（增强时间线完整性）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') fire()
  })
}

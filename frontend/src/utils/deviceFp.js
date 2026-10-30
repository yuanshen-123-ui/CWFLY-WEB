/**
 * 设备指纹工具
 *
 * 生成"真实设备指纹"（Canvas / WebGL / 硬件 / 屏幕等信号组合哈希），
 * 用于：
 * - 注册永久防重：同一设备/网络只能注册一次（后端 DB 持久化判断）
 * - 页面访问记录：访问网页时上报 SecurityEvent 证据链（IP + 指纹 + UA + 来源页）
 *
 * 指纹不再写入 localStorage（隐私考虑），改为模块级内存缓存：
 * - 同一页面会话内多次调用返回同一指纹，避免重复计算
 * - 刷新页面后重新计算（设备信号稳定，结果基本一致）
 * - 每次请求通过请求头 X-Device-Fp 直接传给后端
 */

/** 模块级内存缓存（不落盘，页面刷新后重算） */
let fpCache = ''

/** FNV-1a 32 位哈希（同步、跨浏览器稳定）
 *  作用：将收集到的设备信号汇总为固定长度指纹
 *  调用时机：buildFingerprint 汇总信号后调用 */
function fnv1a(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = (h * 0x01000193) >>> 0
  }
  return ('0000000' + h.toString(16)).slice(-8)
}

/** Canvas 指纹：同设备同浏览器渲染结果稳定
 *  作用：采集 Canvas 渲染特征作为设备指纹信号之一
 *  调用时机：buildFingerprint 收集设备信号时调用 */
function canvasFingerprint() {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 240
    canvas.height = 60
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    ctx.textBaseline = 'top'
    ctx.font = '14px Arial'
    ctx.fillStyle = '#f60'
    ctx.fillRect(125, 1, 62, 20)
    ctx.fillStyle = '#069'
    ctx.fillText('CWFLY-青翼模拟飞行-device-fp', 2, 15)
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)'
    ctx.fillText('abcdefghijklmnopqrstuvwxyz 0123456789', 4, 45)
    return canvas.toDataURL()
  } catch {
    return ''
  }
}

/** WebGL 指纹：GPU 厂商/渲染器（同设备稳定）
 *  作用：采集 GPU 硬件特征作为设备指纹信号之一
 *  调用时机：buildFingerprint 收集设备信号时调用 */
function webglFingerprint() {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    if (!gl) return ''
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''
    const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : ''
    return `${vendor || ''}|${renderer || ''}`
  } catch {
    return ''
  }
}

/** 汇总设备信号生成指纹
 *  作用：组合 UA/语言/平台/硬件/屏幕/时区/Canvas/WebGL 等信号哈希为稳定指纹
 *  调用时机：首次访问且无缓存时，由 getDeviceFp 调用 */
function buildFingerprint() {
  const parts = [
    navigator.userAgent,
    navigator.language,
    navigator.platform || '',
    String(navigator.hardwareConcurrency || ''),
    String(navigator.deviceMemory || ''),
    `${screen.width}x${screen.height}x${screen.colorDepth}@${window.devicePixelRatio || 1}`,
    String(new Date().getTimezoneOffset()),
    String(navigator.maxTouchPoints || 0),
    canvasFingerprint(),
    webglFingerprint()
  ]
  return fnv1a(parts.join('|'))
}

/** 获取设备指纹（内存缓存，不写 localStorage；每次请求直接传给后端）
 *  作用：返回当前设备的稳定指纹，供请求头注入与页面访问上报
 *  调用时机：axios 请求拦截器注入 X-Device-Fp、reportPageView 上报时调用 */
export function getDeviceFp() {
  if (fpCache) return fpCache
  fpCache = buildFingerprint()
  return fpCache
}

/** 访问网页时上报真实设备指纹到服务器（追踪像素 → SecurityEvent 证据链）
 *  作用：页面加载后通过 /api/security/pixel.gif 上报指纹 + 来源页 + IP 到服务器记录
 *  调用时机：应用挂载完成后调用一次 */
export function reportPageView() {
  try {
    const fp = getDeviceFp()
    const path = (location.pathname + location.search).slice(0, 500) || '/'
    const img = new Image()
    img.src = `/api/security/pixel.gif?_fp=${encodeURIComponent(fp)}&_ref=${encodeURIComponent(path)}`
  } catch {
    /* 上报失败不影响页面 */
  }
}

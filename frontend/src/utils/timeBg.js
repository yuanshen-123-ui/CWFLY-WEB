/**
 * 背景图片按北京时间「分钟级精确渐变」切换（2026-08-08 全天上图版）
 *
 * 图片共 15 张（/bg-home/<时段>_<序号>.png）:
 *   nt_1~nt_4  mn_1~mn_3  aft_1~aft_4  eve_1~eve_4
 *
 * 时间表（北京时间, 分钟）:
 *   20:00-5:00    稳定 nt_4
 *   5:00→5:30     渐变 nt_4→mn_1     5:30→6:00 渐变 mn_1→mn_2    6:00→6:30 渐变 mn_2→mn_3
 *   6:30-8:00     稳定 mn_3
 *   8:00→8:30     渐变 mn_3→aft_1
 *   8:30-9:30     稳定 aft_1          9:30→10:00 渐变 aft_1→aft_2
 *   10:00-12:00   稳定 aft_2          12:00→12:30 渐变 aft_2→aft_3
 *   12:30-14:00   稳定 aft_3          14:00→14:30 渐变 aft_3→aft_4
 *   14:30-17:00   稳定 aft_4
 *   17:00→17:30   渐变 aft_4→eve_1    17:30→18:00 渐变 eve_1→eve_2
 *   18:00→18:30   渐变 eve_2→eve_3    18:30→18:45 渐变 eve_3→eve_4
 *   18:45→19:00   渐变 eve_4→nt_1     19:00→19:15 渐变 nt_1→nt_2
 *   19:15→19:30   渐变 nt_2→nt_3      19:30→20:00 渐变 nt_3→nt_4
 *   20:00         循环回稳定 nt_4
 *
 * 渐变进度按分钟线性计算。返回的 preload 字段给出「下一次渐变目标图」，
 * 上层提前预加载，确保渐变开始时图片已完全就绪、不会叠加产生偏色。
 */

const IMG = {
  nt_1: '/bg-home/nt_1.webp', nt_2: '/bg-home/nt_2.webp',
  nt_3: '/bg-home/nt_3.webp', nt_4: '/bg-home/nt_4.webp',
  mn_1: '/bg-home/mn_1.webp', mn_2: '/bg-home/mn_2.webp', mn_3: '/bg-home/mn_3.webp',
  aft_1: '/bg-home/aft_1.webp', aft_2: '/bg-home/aft_2.webp',
  aft_3: '/bg-home/aft_3.webp', aft_4: '/bg-home/aft_4.webp',
  eve_1: '/bg-home/eve_1.webp', eve_2: '/bg-home/eve_2.webp',
  eve_3: '/bg-home/eve_3.webp', eve_4: '/bg-home/eve_4.webp',
}

/**
 * 时间段表（分钟, 北京时间）
 *   img:     稳定段, 整段显示该图
 *   from/to: 渐变段, 从 from 渐变为 to, 进度 = (now-start)/(end-start)
 * 注: 20:00-5:00 跨午夜, 拆成 [1200,1440] 与 [0,300] 两段
 */
const SEGMENTS = [
  { start: 1200, end: 1440, img: 'nt_4' },
  { start: 0, end: 300, img: 'nt_4' },
  { start: 300, end: 330, from: 'nt_4', to: 'mn_1' },
  { start: 330, end: 360, from: 'mn_1', to: 'mn_2' },
  { start: 360, end: 390, from: 'mn_2', to: 'mn_3' },
  { start: 390, end: 480, img: 'mn_3' },
  { start: 480, end: 510, from: 'mn_3', to: 'aft_1' },
  { start: 510, end: 570, img: 'aft_1' },
  { start: 570, end: 600, from: 'aft_1', to: 'aft_2' },
  { start: 600, end: 720, img: 'aft_2' },
  { start: 720, end: 750, from: 'aft_2', to: 'aft_3' },
  { start: 750, end: 840, img: 'aft_3' },
  { start: 840, end: 870, from: 'aft_3', to: 'aft_4' },
  { start: 870, end: 1020, img: 'aft_4' },
  { start: 1020, end: 1050, from: 'aft_4', to: 'eve_1' },
  { start: 1050, end: 1080, from: 'eve_1', to: 'eve_2' },
  { start: 1080, end: 1110, from: 'eve_2', to: 'eve_3' },
  { start: 1110, end: 1125, from: 'eve_3', to: 'eve_4' },
  { start: 1125, end: 1140, from: 'eve_4', to: 'nt_1' },
  { start: 1140, end: 1155, from: 'nt_1', to: 'nt_2' },
  { start: 1155, end: 1170, from: 'nt_2', to: 'nt_3' },
  { start: 1170, end: 1200, from: 'nt_3', to: 'nt_4' },
]

/** 获取北京时间当前分钟（含小数秒, 0~1440） */
function getBeijingMinutes() {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date())
    const get = t => Number((parts.find(p => p.type === t) || {}).value || 0)
    return get('hour') * 60 + get('minute') + get('second') / 60
  } catch (e) {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
  }
}

/** 查找当前所在时间段 */
function findSegment(min) {
  for (const seg of SEGMENTS) {
    if (min >= seg.start && min < seg.end) return seg
  }
  return SEGMENTS[0]
}

/** 当前段之后（循环）第一个渐变段的目标图, 供提前预加载 */
function nextFadeTo(seg) {
  const i = SEGMENTS.indexOf(seg)
  for (let k = 1; k <= SEGMENTS.length; k++) {
    const s = SEGMENTS[(i + k) % SEGMENTS.length]
    if (s.to) return IMG[s.to]
  }
  return ''
}

/** 获取北京时间当前小时 (0-23)，兼容旧调用 */
export function getBeijingHour() {
  return Math.floor(getBeijingMinutes() / 60)
}

/**
 * 计算当前背景渐变状态
 * @returns {{ curBg: string, nextBg: string, fade: number, preload: string }}
 *   curBg   当前显示图 URL
 *   nextBg  渐变目标图 URL（稳定段为空）
 *   fade    nextBg 的透明度 0~1（渐变段 0→1, 稳定段 0）
 *   preload 建议提前预加载的「下一次渐变目标图」URL
 */
export function getTimeBgState() {
  const min = getBeijingMinutes()
  const seg = findSegment(min)

  if (seg.img) {
    // 稳定段: 整段显示该图, 无渐变
    return {
      curBg: IMG[seg.img],
      nextBg: '',
      fade: 0,
      preload: nextFadeTo(seg),
    }
  }

  // 渐变段: from 完全显示, to 从 0 淡入至 1
  const progress = Math.min(1, Math.max(0, (min - seg.start) / (seg.end - seg.start)))
  return {
    curBg: IMG[seg.from],
    nextBg: IMG[seg.to],
    fade: progress,
    preload: nextFadeTo(seg),
  }
}

/**
 * 返回 offsetMinutes 分钟之后「下一次需要渐入」的图 URL
 * 用于 Auto 模式提前缓存: 渐变开始前 offset 分钟即开始预加载,
 * 避免渐变切换时刻才下载大图、高峰时段占用服务器带宽。
 */
export function getUpcomingBg(offsetMinutes = 10) {
  const now = getBeijingMinutes()
  const future = ((now + offsetMinutes) % 1440 + 1440) % 1440
  const seg = findSegment(future)
  return nextFadeTo(seg)
}

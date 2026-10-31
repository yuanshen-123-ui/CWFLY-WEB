/**
 * timeBg.js 单元测试（北京时间分钟级背景渐变状态机）
 *
 * 通过伪定时器固定"当前时间"，逐点验证文档里的时间表：
 * - 稳定段：curBg 固定、nextBg 为空、fade=0，preload 指向下一次渐变目标
 * - 渐变段：fade 按分钟线性、边界 0 / 中点 0.5 / 收尾接近 1
 * - 跨午夜（20:00-5:00 拆两段）与 19:xx 收尾渐变
 * - getBeijingHour 时区换算
 * - getUpcomingBg：offset 分钟后的下一次渐变目标、跨午夜回绕、负 offset
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getTimeBgState, getBeijingHour, getUpcomingBg } from '../timeBg.js'

const HOME = '/bg-home/'

/** 设置"当前时间"为北京时间 h:m:s（内部换算成 UTC 喂给伪定时器） */
function setBeijing(h, m = 0, s = 0) {
  const utcHour = ((h - 8) % 24 + 24) % 24
  vi.setSystemTime(new Date(Date.UTC(2026, 5, 1, utcHour, m, s)))
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getBeijingHour', () => {
  it('按 Asia/Shanghai 时区换算小时', () => {
    setBeijing(12, 0, 0)
    expect(getBeijingHour()).toBe(12)
    setBeijing(0, 30, 0)
    expect(getBeijingHour()).toBe(0)
    setBeijing(23, 59, 59)
    expect(getBeijingHour()).toBe(23)
  })
})

describe('稳定段（整段固定一张图，无渐变）', () => {
  const stableCases = [
    // [北京时:分, 期望图, 期望 preload]
    [20, 0, 'nt_4', 'mn_1'], // 20:00 跨午夜段起点
    [0, 0, 'nt_4', 'mn_1'], // 00:00 跨午夜段第二段起点
    [4, 59, 'nt_4', 'mn_1'], // 05:00 之前仍是夜景
    [6, 40, 'mn_3', 'aft_1'], // 06:30-08:00 稳定 mn_3
    [11, 59, 'aft_2', 'aft_3'], // 10:00-12:00 稳定 aft_2
    [13, 0, 'aft_3', 'aft_4'], // 12:30-14:00 稳定 aft_3
    [14, 30, 'aft_4', 'eve_1'], // 14:30-17:00 稳定 aft_4
    [16, 59, 'aft_4', 'eve_1'],
  ]

  it.each(stableCases)('%i:%i 显示 %s（稳定段）', (h, m, img, preload) => {
    setBeijing(h, m, 0)
    const state = getTimeBgState()
    expect(state.curBg).toBe(`${HOME}${img}.webp`)
    expect(state.nextBg).toBe('')
    expect(state.fade).toBe(0)
    expect(state.preload).toBe(`${HOME}${preload}.webp`)
  })
})

describe('渐变段（fade 按分钟线性）', () => {
  it('05:00 是 nt_4 -> mn_1 渐变的起点：fade=0，preload 指向下一段渐变目标', () => {
    setBeijing(5, 0, 0)
    const state = getTimeBgState()
    expect(state.curBg).toBe(`${HOME}nt_4.webp`)
    expect(state.nextBg).toBe(`${HOME}mn_1.webp`)
    expect(state.fade).toBe(0)
    expect(state.preload).toBe(`${HOME}mn_2.webp`)
  })

  it('05:15 渐变中点 fade=0.5', () => {
    setBeijing(5, 15, 0)
    const state = getTimeBgState()
    expect(state.curBg).toBe(`${HOME}nt_4.webp`)
    expect(state.nextBg).toBe(`${HOME}mn_1.webp`)
    expect(state.fade).toBeCloseTo(0.5, 10)
  })

  it('05:29:30 接近渐变结束，fade 已接近 1 但不超过 1', () => {
    setBeijing(5, 29, 30)
    const state = getTimeBgState()
    expect(state.fade).toBeGreaterThan(0.98)
    expect(state.fade).toBeLessThan(1)
    expect(state.nextBg).toBe(`${HOME}mn_1.webp`)
  })

  it('08:00 mn_3 -> aft_1 渐变起点', () => {
    setBeijing(8, 0, 0)
    const state = getTimeBgState()
    expect(state.curBg).toBe(`${HOME}mn_3.webp`)
    expect(state.nextBg).toBe(`${HOME}aft_1.webp`)
    expect(state.fade).toBe(0)
    expect(state.preload).toBe(`${HOME}aft_2.webp`)
  })

  it('12:00 aft_2 -> aft_3 渐变起点（整点是渐变而不是稳定）', () => {
    setBeijing(12, 0, 0)
    const state = getTimeBgState()
    expect(state.curBg).toBe(`${HOME}aft_2.webp`)
    expect(state.nextBg).toBe(`${HOME}aft_3.webp`)
    expect(state.fade).toBe(0)
    expect(state.preload).toBe(`${HOME}aft_4.webp`)
  })

  it('17:00 aft_4 -> eve_1 渐变起点', () => {
    setBeijing(17, 0, 0)
    const state = getTimeBgState()
    expect(state.curBg).toBe(`${HOME}aft_4.webp`)
    expect(state.nextBg).toBe(`${HOME}eve_1.webp`)
    expect(state.fade).toBe(0)
    expect(state.preload).toBe(`${HOME}eve_2.webp`)
  })

  it('18:30 eve_3 -> eve_4 渐变（这段只有 15 分钟）', () => {
    setBeijing(18, 30, 0)
    const state = getTimeBgState()
    expect(state.curBg).toBe(`${HOME}eve_3.webp`)
    expect(state.nextBg).toBe(`${HOME}eve_4.webp`)
    expect(state.fade).toBe(0)
  })

  it('19:30 nt_3 -> nt_4 渐变起点', () => {
    setBeijing(19, 30, 0)
    const state = getTimeBgState()
    expect(state.curBg).toBe(`${HOME}nt_3.webp`)
    expect(state.nextBg).toBe(`${HOME}nt_4.webp`)
    expect(state.fade).toBe(0)
  })

  it('19:59 时 nt_3 -> nt_4 渐变收尾，fade 接近 1', () => {
    setBeijing(19, 59, 0)
    const state = getTimeBgState()
    expect(state.fade).toBeCloseTo(29 / 30, 10)
    expect(state.nextBg).toBe(`${HOME}nt_4.webp`)
  })
})

describe('状态不变量', () => {
  it('任意时刻 fade 都落在 [0,1]，curBg 都是 /bg-home/*.webp', () => {
    const samples = [
      [0, 0], [4, 0], [5, 10], [6, 0], [7, 0], [9, 45], [12, 10], [14, 15],
      [17, 10], [18, 40], [19, 0], [20, 0], [23, 59],
    ]
    samples.forEach(([h, m]) => {
      setBeijing(h, m, 0)
      const state = getTimeBgState()
      expect(state.fade).toBeGreaterThanOrEqual(0)
      expect(state.fade).toBeLessThanOrEqual(1)
      expect(state.curBg.startsWith(HOME)).toBe(true)
      expect(state.curBg.endsWith('.webp')).toBe(true)
      if (state.nextBg) {
        expect(state.nextBg.startsWith(HOME)).toBe(true)
        expect(state.nextBg).not.toBe(state.curBg)
      }
      expect(state.preload.startsWith(HOME)).toBe(true)
    })
  })
})

describe('getUpcomingBg（提前预加载）', () => {
  it('07:50 + 10 分钟后进入 mn_3 -> aft_1 渐变，预取其后的 aft_2', () => {
    setBeijing(7, 50, 0)
    expect(getUpcomingBg(10)).toBe(`${HOME}aft_2.webp`)
  })

  it('23:55 + 10 分钟跨午夜回绕到 00:05，预取 mn_1', () => {
    setBeijing(23, 55, 0)
    expect(getUpcomingBg(10)).toBe(`${HOME}mn_1.webp`)
  })

  it('offset=0 与当前段 preload 一致', () => {
    setBeijing(12, 0, 0)
    expect(getUpcomingBg(0)).toBe(getTimeBgState().preload)
  })

  it('负 offset（往前看）也按 1440 分钟循环处理', () => {
    setBeijing(0, 10, 0)
    // 00:10 - 20 分钟 = 前一天 23:50，仍属于 20:00-24:00 稳定段 -> 预取 mn_1
    expect(getUpcomingBg(-20)).toBe(`${HOME}mn_1.webp`)
  })
})

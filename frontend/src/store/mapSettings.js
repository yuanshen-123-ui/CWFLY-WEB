import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 地图设置全局状态（header 齿轮面板 ↔ OnlineMap 共享）
 * weatherRadar: 气象雷达开关
 * devTool: 开发者工具('cursor' 光标定位 / 'draw' 区域绘制 / null 关闭)
 */
export const useMapSettingsStore = defineStore('mapSettings', () => {
  const weatherRadar = ref(false)
  const devTool = ref(null) // 'cursor' | 'draw' | 'airport-edit' | null

  function toggleRadar() {
    weatherRadar.value = !weatherRadar.value
  }

  function setDevTool(tool) {
    devTool.value = devTool.value === tool ? null : tool
  }

  return { weatherRadar, toggleRadar, devTool, setDevTool }
})

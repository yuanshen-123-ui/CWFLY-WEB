/**
 * 通用表格排序指令（v-sort）
 *
 * 作用：让任何 <table v-sort> 支持点击表头排序；默认按第一列 A-Z / 1-9 升序。
 * 调用时机：main.js 全局注册，模板中给 <table> 加 v-sort 即生效。
 *
 * 特性：
 * - 点击表头切换 升序/降序（再点同列切换方向），表头显示 ▲/▼ 指示
 * - 纯 DOM 排序，不依赖组件数据；数字列按数值比较、文本按 zh-CN 排序
 * - 自动跳过"暂无数据"等 colspan 空状态行
 */

/** 单元格文本比较：数值优先，其次文本（zh-CN） */
function compareCell(a, b) {
  const na = Number(a)
  const nb = Number(b)
  const aNum = a !== '' && !Number.isNaN(na)
  const bNum = b !== '' && !Number.isNaN(nb)
  if (aNum && bNum) return na - nb
  return String(a).localeCompare(String(b), 'zh-CN')
}

export default {
  mounted(el, binding) {
    const table = el.tagName === 'TABLE' ? el : el.querySelector('table')
    if (!table) return
    const thead = table.querySelector('thead')
    const tbody = table.querySelector('tbody')
    if (!thead || !tbody) return
    const ths = Array.from(thead.querySelectorAll('th'))
    if (!ths.length) return

    // 排序配置：v-sort="{ index, desc }"；默认第一列升序（A-Z / 1-9）
    const cfg = binding.value || {}
    let sortIndex = typeof cfg.index === 'number' ? cfg.index : 0
    let sortAsc = cfg.desc !== true

    /** 取一行第 i 个单元格文本 */
    function cellText(tr, i) {
      const td = tr.children[i]
      return td ? (td.innerText || '').trim() : ''
    }

    /** 排序并重排 DOM */
    function applySort() {
      const thCount = ths.length
      // 排除空状态行（td 数不等于 th 数，如 colspan 的"暂无数据"）
      const dataRows = Array.from(tbody.querySelectorAll('tr')).filter(r => r.children.length === thCount)
      if (dataRows.length < 2) return
      dataRows.sort((r1, r2) => {
        const c = compareCell(cellText(r1, sortIndex), cellText(r2, sortIndex))
        return sortAsc ? c : -c
      })
      dataRows.forEach(r => tbody.appendChild(r))
    }

    /** 更新表头排序指示 */
    function updateHeader() {
      ths.forEach((th, i) => {
        th.classList.toggle('sort-active', i === sortIndex)
        if (i === sortIndex) th.setAttribute('data-sort', sortAsc ? 'asc' : 'desc')
        else th.removeAttribute('data-sort')
      })
    }

    ths.forEach((th, i) => {
      th.style.cursor = 'pointer'
      th.addEventListener('click', () => {
        if (sortIndex === i) sortAsc = !sortAsc
        else { sortIndex = i; sortAsc = true }
        applySort()
        updateHeader()
      })
    })

    // 初始排序：等待 tbody 有数据后按配置列排序（数据到达后自动执行一次）
    const runInitial = () => {
      if (tbody.querySelectorAll('tr').length) {
        applySort()
        updateHeader()
        mo.disconnect()
      }
    }
    const mo = new MutationObserver(runInitial)
    mo.observe(tbody, { childList: true })
    runInitial()
  }
}

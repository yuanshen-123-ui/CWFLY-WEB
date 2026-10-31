// @vitest-environment jsdom
/**
 * tableSort.js（v-sort 指令）单元测试
 *
 * 覆盖点：
 * - 默认按第一列升序，数字列按数值比较（'9' < '10'，不是字符串比较）
 * - 点击表头：同列再点切换升降序、换列重置为升序，data-sort / sort-active 指示同步
 * - 文本列按 zh-CN 排序（中文按拼音：北京 < 杭州 < 上海）
 * - 数字与文本混排时退化为文本比较
 * - 排除 colspan 空状态行；行数 < 2 不排序；表结构缺失（无 thead/tbody）安全退出
 * - v-sort="{ index, desc }" 指定初始排序列与方向
 * - 数据后到（MutationObserver）自动补排一次
 *
 * 备注：jsdom 不实现 HTMLElement.innerText，这里在测试内补一个等价 shim，
 * 让被测代码里 `td.innerText` 的取值路径与真实浏览器一致。
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import tableSort from '../tableSort.js'

beforeAll(() => {
  if (!('innerText' in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, 'innerText', {
      configurable: true,
      get() {
        return this.textContent
      },
      set(v) {
        this.textContent = v
      },
    })
  }
})

beforeEach(() => {
  document.body.innerHTML = ''
})

/** 构造表格：headers 为表头文本，rows 为数据行文本数组 */
function buildTable(headers, rows) {
  const table = document.createElement('table')
  const thead = document.createElement('thead')
  const headRow = document.createElement('tr')
  headers.forEach((h) => {
    const th = document.createElement('th')
    th.textContent = h
    headRow.appendChild(th)
  })
  thead.appendChild(headRow)
  table.appendChild(thead)

  const tbody = document.createElement('tbody')
  rows.forEach((cells) => tbody.appendChild(buildRow(cells)))
  table.appendChild(tbody)
  document.body.appendChild(table)
  return { table, tbody, ths: Array.from(headRow.querySelectorAll('th')) }
}

function buildRow(cells) {
  const tr = document.createElement('tr')
  cells.forEach((c) => {
    const td = document.createElement('td')
    td.textContent = c
    tr.appendChild(td)
  })
  return tr
}

/** 当前 tbody 中每行首列文本（按 DOM 顺序） */
function firstColumn(tbody) {
  return Array.from(tbody.querySelectorAll('tr')).map((tr) => tr.children[0]?.textContent ?? '')
}

/** 当前 tbody 中所有行（children 数量等于表头数的）的文本数组 */
function dataRowTexts(tbody, columnCount) {
  return Array.from(tbody.querySelectorAll('tr'))
    .filter((tr) => tr.children.length === columnCount)
    .map((tr) => Array.from(tr.children).map((td) => td.textContent))
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('默认排序（第一列升序）', () => {
  it('数字列按数值比较：9 排在 10 前面', () => {
    const { table, tbody } = buildTable(['数量'], [['10'], ['9'], ['100'], ['2']])
    tableSort.mounted(table, { value: undefined })
    expect(firstColumn(tbody)).toEqual(['2', '9', '10', '100'])
  })

  it('中文列按 zh-CN 拼音排序：北京 < 杭州 < 上海', () => {
    const { table, tbody } = buildTable(['城市'], [['上海'], ['北京'], ['杭州']])
    tableSort.mounted(table, { value: undefined })
    expect(firstColumn(tbody)).toEqual(['北京', '杭州', '上海'])
  })

  it('数字与文本混排时逐对选择比较方式（数字对按数值、与文本比时按文本）', () => {
    const { table, tbody } = buildTable(['值'], [['abc'], ['2'], ['10']])
    tableSort.mounted(table, { value: undefined })
    // compareCell 是逐对判断的：'2' vs '10' 两边都是数字 -> 数值比较（2 < 10）；
    // 任一单元格不是数字时才退化为 zh-CN 文本比较（'abc' 排在数字后面）
    expect(firstColumn(tbody)).toEqual(['2', '10', 'abc'])
  })

  it('只排序数据行，忽略 colspan 空状态行', () => {
    const { table, tbody } = buildTable(['名称', '值'], [['b', '2'], ['a', '1']])
    // 追加一条 colspan 的空状态行（只有 1 个 td）
    const emptyRow = document.createElement('tr')
    const td = document.createElement('td')
    td.setAttribute('colspan', '2')
    td.textContent = '暂无数据'
    emptyRow.appendChild(td)
    tbody.appendChild(emptyRow)

    tableSort.mounted(table, { value: undefined })
    expect(tbody.querySelectorAll('tr')).toHaveLength(3)
    expect(dataRowTexts(tbody, 2)).toEqual([
      ['a', '1'],
      ['b', '2'],
    ])
  })

  it('只有一行数据时不排序也不报错', () => {
    const { table, tbody } = buildTable(['名称'], [['only']])
    expect(() => tableSort.mounted(table, { value: undefined })).not.toThrow()
    expect(firstColumn(tbody)).toEqual(['only'])
  })
})

describe('点击表头切换排序', () => {
  it('同列再点一次切换为降序，再点回到升序', () => {
    const { table, tbody, ths } = buildTable(['数量'], [['10'], ['2'], ['9']])
    tableSort.mounted(table, { value: undefined })
    expect(firstColumn(tbody)).toEqual(['2', '9', '10'])
    expect(ths[0].getAttribute('data-sort')).toBe('asc')

    ths[0].click()
    expect(firstColumn(tbody)).toEqual(['10', '9', '2'])
    expect(ths[0].getAttribute('data-sort')).toBe('desc')

    ths[0].click()
    expect(firstColumn(tbody)).toEqual(['2', '9', '10'])
    expect(ths[0].getAttribute('data-sort')).toBe('asc')
  })

  it('点击另一列时按该列升序排序，并转移排序指示', () => {
    const { table, tbody, ths } = buildTable(
      ['名称', '数量'],
      [['a', '30'], ['b', '100'], ['c', '2']],
    )
    tableSort.mounted(table, { value: undefined })
    expect(ths[0].classList.contains('sort-active')).toBe(true)

    ths[1].click()
    expect(ths[1].classList.contains('sort-active')).toBe(true)
    expect(ths[0].classList.contains('sort-active')).toBe(false)
    expect(ths[0].hasAttribute('data-sort')).toBe(false)
    expect(ths[1].getAttribute('data-sort')).toBe('asc')
    expect(dataRowTexts(tbody, 2)).toEqual([
      ['c', '2'],
      ['a', '30'],
      ['b', '100'],
    ])
  })
})

describe('v-sort 绑定参数', () => {
  it('v-sort="{ index: 1, desc: true }" 初始按第二列降序', () => {
    const { table, tbody } = buildTable(
      ['名称', '数量'],
      [['a', '30'], ['b', '100'], ['c', '2']],
    )
    tableSort.mounted(table, { value: { index: 1, desc: true } })
    expect(dataRowTexts(tbody, 2)).toEqual([
      ['b', '100'],
      ['a', '30'],
      ['c', '2'],
    ])
  })

  it('index 越界时取不到单元格文本，排序不抛错', () => {
    const { table } = buildTable(['名称'], [['a'], ['b']])
    expect(() => tableSort.mounted(table, { value: { index: 5 } })).not.toThrow()
  })
})

describe('DOM 结构与数据后到', () => {
  it('传入的是包裹 table 的容器时也能找到表格', () => {
    const { table, tbody } = buildTable(['数量'], [['10'], ['2']])
    const wrapper = document.createElement('div')
    document.body.appendChild(wrapper)
    wrapper.appendChild(table)
    tableSort.mounted(wrapper, { value: undefined })
    expect(firstColumn(tbody)).toEqual(['2', '10'])
  })

  it('没有 thead / tbody 的表结构安全退出', () => {
    const table = document.createElement('table')
    const tr = document.createElement('tr')
    table.appendChild(tr)
    document.body.appendChild(table)
    expect(() => tableSort.mounted(table, { value: undefined })).not.toThrow()
  })

  it('初始无数据、数据异步到达后自动排序一次并更新表头', async () => {
    const { table, tbody, ths } = buildTable(['数量'], [])
    tableSort.mounted(table, { value: undefined })

    tbody.appendChild(buildRow(['10']))
    tbody.appendChild(buildRow(['2']))
    // MutationObserver 回调是异步的，等它执行
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(firstColumn(tbody)).toEqual(['2', '10'])
    expect(ths[0].getAttribute('data-sort')).toBe('asc')
  })
})

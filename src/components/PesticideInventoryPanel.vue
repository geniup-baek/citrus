<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { useFarmStore } from '../stores/farmStore'
import { useLocaleStore } from '../stores/localeStore'
import { useRecommendSettingsStore } from '../stores/recommendSettingsStore'
import { confirm } from '../composables/useConfirm'
import { searchFromFullCache, findBestMatchInCache } from '../services/pesticide.js'
import { moaColor } from '../services/recommend.js'
import { usePesticideTypes } from '../composables/usePesticideTypes.js'
import { useIsMobile } from '../composables/useIsMobile.js'

const store      = useFarmStore()
const localeStr  = useLocaleStore()
const recSettingsStore = useRecommendSettingsStore()
const t          = (key, p) => localeStr.t(key, p)

const CATEGORY = '농약'

const { typeNames: pesticideTypes, resolveType } = usePesticideTypes()
const { isMobile } = useIsMobile()

const formTarget = computed(() =>
  editingId.value && displayedItems.value.some(i => i.id === editingId.value)
    ? `#pip-form-slot-${editingId.value}`
    : '#pip-form-top'
)

function scrollToItem(slotId) {
  if (!isMobile.value) return
  nextTick(() => {
    const el = document.getElementById(slotId)
    ;(el?.closest('li') ?? el)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

const showForm     = ref(false)
const formMode     = ref('single') // 'single' | 'bulk'
const editingId    = ref('')
const expandedId   = ref('')
const sortBy       = ref('name')
const sortDir      = ref('asc')
const unmatchedOnly = ref(false)
const EXPIRY_SOON  = 30

const form = reactive({
  id: '', name: '', pesticideType: '살충제',
  actionGroup: '', productName: '', notes: '',
})

const txnForm = reactive({
  type: '입고', volume: '', expiryDate: '', amount: '', note: '',
})

const editingTxnId = ref('')
const editTxnForm  = reactive({
  type: '입고', volume: '', expiryDate: '', amount: '', note: '',
})

// ── 농약 종류 뱃지 ────────────────────────────────────────────────────────────
const categoryClass = (cat) => ({
  '살균제': 'cat-fungicide',
  '살비제': 'cat-miticide',
  '살충제': 'cat-insecticide',
}[cat] ?? '')

// ── OpenAPI 상표명 검색 ───────────────────────────────────────────────────────

const invMatchResults = ref([])

function onNameInput() {
  const q = form.name.trim()
  if (!q) { invMatchResults.value = []; return }
  const result = searchFromFullCache({ pestName: q, page: 1, pageSize: 10 })
  invMatchResults.value = result?.list ?? []
}

function applyInvMatch(apiItem) {
  form.name = apiItem.brandName
  if (apiItem.pesticideType) {
    const mapped = resolveType(apiItem.pesticideType)
    if (pesticideTypes.value.includes(mapped)) form.pesticideType = mapped
  }
  if (apiItem.modeOfAction && apiItem.modeOfAction !== '-') form.actionGroup  = apiItem.modeOfAction
  if (apiItem.name)                                          form.productName  = apiItem.name
  invMatchResults.value = []
}

// ── 목록 항목 농약정보 연결 ───────────────────────────────────────────────────
const linkingItemId = ref(null)
const linkQuery     = ref('')
const linkResults   = ref([])

function openLink(itemId) {
  if (linkingItemId.value === itemId) {
    linkingItemId.value = null
    linkQuery.value     = ''
    linkResults.value   = []
    return
  }
  expandedId.value    = ''   // 입출고 패널과 상호 배타
  linkingItemId.value = itemId
  linkQuery.value     = ''
  linkResults.value   = []
}

function searchLinkCandidates(query) {
  if (!query.trim()) { linkResults.value = []; return }
  const result = searchFromFullCache({ pestName: query.trim(), page: 1, pageSize: 12 })
  linkResults.value = result?.list ?? []
}

async function applyLink(item, apiItem) {
  const mappedType = resolveType(apiItem.pesticideType)
  await store.upsertInventoryItem({
    id:            item.id,
    name:          apiItem.brandName || item.name,
    category:      CATEGORY,
    pesticideType: pesticideTypes.value.includes(mappedType) ? mappedType : (item.pesticideType || ''),
    actionGroup:   (apiItem.modeOfAction && apiItem.modeOfAction !== '-') ? apiItem.modeOfAction : (item.actionGroup || ''),
    productName:   apiItem.name || item.productName || '',
    notes:         item.notes || '',
  })
  linkingItemId.value = null
  linkQuery.value     = ''
  linkResults.value   = []
}

// ── 로트 계산 ─────────────────────────────────────────────────────────────────
function lotsOf(item) {
  const map = new Map()
  for (const tx of item.txns || []) {
    const key = `${tx.volume} ${tx.expiryDate}`
    if (!map.has(key)) map.set(key, { volume: tx.volume, expiryDate: tx.expiryDate, quantity: 0 })
    map.get(key).quantity += tx.type === '사용' ? -Number(tx.amount || 0) : Number(tx.amount || 0)
  }
  return [...map.values()]
    .filter(l => l.quantity !== 0)
    .sort((a, b) =>
      (a.expiryDate || '9999-12-31').localeCompare(b.expiryDate || '9999-12-31') ||
      a.volume.localeCompare(b.volume),
    )
}

function volumeOptions(item) {
  return [...new Set((item.txns || []).map(tx => tx.volume).filter(Boolean))]
}

function expiryStatus(dateStr) {
  if (!dateStr) return ''
  const d = parseISO(dateStr)
  if (Number.isNaN(d.getTime())) return ''
  const diff = differenceInCalendarDays(d, new Date())
  if (diff < 0) return 'expired'
  if (diff <= EXPIRY_SOON) return 'soon'
  return ''
}

function earliestExpiry(item) {
  const dates = lotsOf(item).map(l => l.expiryDate).filter(Boolean)
  return dates.length ? dates.sort()[0] : '9999-12-31'
}

function expiringLotCount(item) {
  return lotsOf(item).filter(l => expiryStatus(l.expiryDate) !== '').length
}

function lotText(lot) {
  return t('inventory.lotLabel', {
    volume: lot.volume,
    expiry: lot.expiryDate || t('inventory.noExpiry'),
    quantity: lot.quantity,
  })
}

function formatTxnDate(dateStr) {
  try { return format(new Date(dateStr), 'MM/dd HH:mm') } catch { return dateStr }
}

// ── 목록 ─────────────────────────────────────────────────────────────────────
const displayedItems = computed(() => {
  const list = store.state.inventory
    .filter(i => i.category === CATEGORY)
    .filter(i => !unmatchedOnly.value || !i.actionGroup)
    .sort((a, b) => {
      const va = sortBy.value === 'expiry' ? earliestExpiry(a) : a.name
      const vb = sortBy.value === 'expiry' ? earliestExpiry(b) : b.name
      return sortDir.value === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    })
  return list
})

const summary = computed(() => {
  const items = store.state.inventory.filter(i => i.category === CATEGORY)
  return {
    total:         displayedItems.value.length,
    categoryTotal: items.length,
    expiring:      displayedItems.value.reduce((s, i) => s + expiringLotCount(i), 0),
    unmatched:     items.filter(i => !i.actionGroup).length,
  }
})

const isFiltered = computed(() => unmatchedOnly.value)

// ── 폼 ───────────────────────────────────────────────────────────────────────
function clearForm() {
  Object.assign(form, {
    id: '', name: '',
    pesticideType: pesticideTypes.value[0] ?? '살충제',
    actionGroup: '', productName: '', notes: '',
  })
  editingId.value      = ''
  formMode.value       = 'single'
  invMatchResults.value = []
  bulkPasteText.value    = ''
  bulkImportMessage.value = ''
}

// 필터 변경으로 편집 중인 품목이 목록에서 사라지면 보이지 않는 항목을 계속 편집하는
// 상태로 남기지 않고 새 품목 입력 폼으로 되돌린다.
watch(displayedItems, (list) => {
  if (editingId.value && !list.some((i) => i.id === editingId.value)) {
    clearForm()
  }
})

function openAdd() { clearForm(); showForm.value = true }
function newEntry() {
  clearForm()
  if (isMobile.value) {
    nextTick(() => document.getElementById('pip-form-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
}

function editItem(item) {
  if (editingId.value === item.id) return
  expandedId.value = ''
  Object.assign(form, {
    id:            item.id,
    name:          item.name,
    pesticideType: item.pesticideType || pesticideTypes.value[0] || '살충제',
    actionGroup:   item.actionGroup  || '',
    productName:   item.productName  || '',
    notes:         item.notes        || '',
  })
  editingId.value  = item.id
  formMode.value   = 'single'
  showForm.value   = true
  scrollToItem(`pip-form-slot-${item.id}`)
}

function closeForm() {
  clearForm()
  showForm.value      = false
  expandedId.value    = ''
  linkingItemId.value = null
  linkQuery.value     = ''
  linkResults.value   = []
}

async function saveItem() {
  await store.upsertInventoryItem({
    id:            form.id || undefined,
    name:          form.name,
    category:      CATEGORY,
    pesticideType: form.pesticideType,
    actionGroup:   form.actionGroup,
    productName:   form.productName,
    notes:         form.notes,
  })
  clearForm()
}

// ── 붙여넣기 일괄추가 (상품명 / 용량 / 유효기간 / 수량 / 비고) ───────────────────
const bulkPasteText = ref('')
const bulkImporting = ref(false)
const bulkImportMessage = ref('')

// 유효기간은 YYYY-MM-DD, YYYY/MM/DD, YYYYMMDD 세 형식을 모두 허용한다.
function parseBulkInventoryDate(raw) {
  const s = raw.trim()
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`
  const separated = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/)
  return separated ? `${separated[1]}-${separated[2]}-${separated[3]}` : ''
}

function parseBulkInventoryText(text) {
  const rows = []
  for (const line of text.split('\n')) {
    const cols = line.replace(/\r$/, '').split('\t')
    const name = (cols[0] || '').trim()
    const volume = (cols[1] || '').trim()
    const expiryDate = parseBulkInventoryDate(cols[2] || '')
    const amount = Number((cols[3] || '').trim())
    const note = (cols[4] || '').trim()
    if (!name || !volume || !amount || amount <= 0) continue
    rows.push({ name, volume, expiryDate, amount, note })
  }
  return rows
}

const bulkParsedRows = computed(() => parseBulkInventoryText(bulkPasteText.value))

// 같은 상품명이 이미 목록에 있으면 그 품목에 새 로트(입고)만 추가하고,
// 없으면 OpenAPI 캐시로 자동 연결을 시도하며 새 품목을 만든 뒤 입고를 기록한다.
async function importBulkInventory() {
  const rows = bulkParsedRows.value
  if (!rows.length) return
  bulkImporting.value = true
  bulkImportMessage.value = ''
  let addedItems = 0
  try {
    if (recSettingsStore.settings.bulkImportMode === 'replace') {
      const existingIds = store.state.inventory.filter((i) => i.category === CATEGORY).map((i) => i.id)
      for (const id of existingIds) {
        await store.removeInventoryItem(id)
      }
    }
    for (const row of rows) {
      const existing = store.state.inventory.find((i) => i.category === CATEGORY && i.name === row.name)
      let itemId = existing?.id
      if (!itemId) {
        itemId = crypto.randomUUID()
        const match = findBestMatchInCache(row.name)
        const mappedType = match ? resolveType(match.pesticideType) : ''
        await store.upsertInventoryItem({
          id: itemId,
          name: row.name,
          category: CATEGORY,
          pesticideType: (mappedType && pesticideTypes.value.includes(mappedType)) ? mappedType : (pesticideTypes.value[0] ?? '살충제'),
          actionGroup: (match?.modeOfAction && match.modeOfAction !== '-') ? match.modeOfAction : '',
          productName: match?.name || '',
          notes: row.note,
        })
        addedItems++
      } else if (row.note && !existing.notes?.includes(row.note)) {
        // 이미 있는 품목이면 비고와 같은 문구가 메모에 없을 때만 이어붙인다.
        existing.notes = existing.notes ? `${existing.notes}\n${row.note}` : row.note
        await store.upsertInventoryItem({ id: itemId, notes: existing.notes })
      }
      await store.addInventoryTxn(itemId, {
        type: '입고', volume: row.volume, expiryDate: row.expiryDate, amount: row.amount, note: '',
      })
    }
    const prefix = recSettingsStore.settings.bulkImportMode === 'replace' ? '전체 새로 작성됨: ' : ''
    bulkImportMessage.value = `${prefix}${rows.length}건 입고 처리됨 (신규 품목 ${addedItems}개)`
    bulkPasteText.value = ''
  } finally {
    bulkImporting.value = false
  }
}

async function deleteItem(item) {
  const txns = (item.txns || []).length
  const ok = await confirm({ message: t('confirm.inventoryItem', { name: item.name, txns }) })
  if (!ok) return
  await store.removeInventoryItem(item.id)
  if (expandedId.value === item.id) expandedId.value = ''
}

// ── 입출고 ───────────────────────────────────────────────────────────────────
function toggleExpand(item) {
  if (expandedId.value === item.id) { expandedId.value = ''; return }
  if (editingId.value) clearForm()
  showForm.value      = false
  linkingItemId.value = null
  expandedId.value    = item.id
  Object.assign(txnForm, { type: '입고', volume: '', expiryDate: '', amount: '', note: '' })
  cancelEditTxn()
}

async function recordTxn(item) {
  const amount = Number(txnForm.amount)
  if (!txnForm.volume.trim() || !amount || amount <= 0) return
  await store.addInventoryTxn(item.id, {
    type: txnForm.type, volume: txnForm.volume.trim(),
    expiryDate: txnForm.expiryDate, amount, note: txnForm.note,
  })
  txnForm.amount = ''
  txnForm.note   = ''
}

function txnKey(txn) { return txn.id || txn.date }

function startEditTxn(txn) {
  editingTxnId.value = txnKey(txn)
  Object.assign(editTxnForm, {
    type:       txn.type === '사용' ? '사용' : '입고',
    volume:     txn.volume     || '',
    expiryDate: txn.expiryDate || '',
    amount:     txn.amount,
    note:       txn.note       || '',
  })
}

function cancelEditTxn() {
  editingTxnId.value = ''
  Object.assign(editTxnForm, { volume: '', expiryDate: '', amount: '', note: '' })
}

async function saveEditTxn(item) {
  const amount = Number(editTxnForm.amount)
  if (!editTxnForm.volume.trim() || !amount || amount <= 0) return
  await store.updateInventoryTxn(item.id, editingTxnId.value, {
    type: editTxnForm.type, volume: editTxnForm.volume.trim(),
    expiryDate: editTxnForm.expiryDate, amount, note: editTxnForm.note,
  })
  cancelEditTxn()
}

async function deleteTxn(item, txn) {
  await store.removeInventoryTxn(item.id, txnKey(txn))
  if (editingTxnId.value === txnKey(txn)) cancelEditTxn()
}

// ── CSV 다운로드 ──────────────────────────────────────────────────────────────
function csvCell(value) {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

function statusText(dateStr) {
  const s = expiryStatus(dateStr)
  if (s === 'expired') return t('inventory.expired')
  if (s === 'soon')    return t('inventory.expiringSoon')
  return ''
}

function downloadReport() {
  const headers = [
    t('pesticideInventory.name'), t('pesticideInventory.pesticideType'),
    t('pesticideInventory.actionGroup'), t('pesticideInventory.productName'),
    t('inventory.volume'), t('inventory.expiryDate'),
    t('inventory.amount'), t('inventory.reportStatus'), t('inventory.notes'),
  ]
  const rows = [headers]
  for (const item of [...displayedItems.value].sort((a, b) => a.name.localeCompare(b.name))) {
    const base = [item.name, item.pesticideType || '', item.actionGroup || '', item.productName || '']
    const lots = lotsOf(item)
    if (lots.length) {
      for (const lot of lots)
        rows.push([...base, lot.volume, lot.expiryDate || '', lot.quantity, statusText(lot.expiryDate), item.notes || ''])
    } else {
      rows.push([...base, '', '', 0, '', item.notes || ''])
    }
  }
  const csv  = String.fromCodePoint(0xfeff) + rows.map(r => r.map(csvCell).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), {
    href:     url,
    download: `농약재고-${format(new Date(), 'yyyy-MM-dd')}.csv`,
  })
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ── PDF/인쇄 ────────────────────────────────────────────────────────────────
// 외부 라이브러리 없이 브라우저 인쇄 → 'PDF로 저장'을 사용한다(한글 폰트 문제 없음).
function htmlCell(value) {
  return String(value ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
}

function rowClass(status) {
  if (status === 'expired') return 'row-expired'
  if (status === 'soon') return 'row-soon'
  return ''
}

function printReport() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const items = [...displayedItems.value].sort((a, b) => a.name.localeCompare(b.name))
  const headers = [
    t('pesticideInventory.name'), t('pesticideInventory.pesticideType'),
    t('pesticideInventory.actionGroup'), t('pesticideInventory.productName'),
    t('inventory.volume'), t('inventory.expiryDate'),
    t('inventory.amount'), t('inventory.reportStatus'), t('inventory.notes'),
  ]

  let bodyRows = ''
  for (const item of items) {
    const base = [item.name, item.pesticideType || '', item.actionGroup || '', item.productName || '']
    const lots = lotsOf(item)
    const cellsToRow = (cells, cls) => {
      const tds = cells.map((c) => `<td>${htmlCell(c)}</td>`).join('')
      return `<tr class="${cls}">${tds}</tr>`
    }
    if (lots.length) {
      for (const lot of lots) {
        const s = expiryStatus(lot.expiryDate)
        bodyRows += cellsToRow(
          [...base, lot.volume, lot.expiryDate || '—', lot.quantity, statusText(lot.expiryDate), item.notes || ''],
          rowClass(s),
        )
      }
    } else {
      bodyRows += cellsToRow([...base, '', '—', 0, '', item.notes || ''], '')
    }
  }

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8" />
<title>${htmlCell(t('pesticideInventory.reportTitle'))} ${today}</title>
<style>
  * { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; }
  body { margin: 24px; color: #1a1a1a; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { color: #666; font-size: 12px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #ccc; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; }
  .row-expired td { color: #c0392b; font-weight: 700; }
  .row-soon td { color: #d35400; }
  @media print { body { margin: 0; } th { background: #f0f0f0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
<h1>${htmlCell(t('pesticideInventory.reportTitle'))}</h1>
<p class="meta">${htmlCell(t('inventory.reportGeneratedAt', { date: today }))} · ${htmlCell(t('inventory.summaryTotal', { count: summary.total }))}${summary.expiring ? ' · ' + htmlCell(t('inventory.summaryExpiring', { count: summary.expiring })) : ''}</p>
<table><thead><tr>${headers.map((h) => `<th>${htmlCell(h)}</th>`).join('')}</tr></thead>
<tbody>${bodyRows}</tbody></table>
</body></html>`

  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  if (recSettingsStore.settings.autoOpenPrintDialog) {
    setTimeout(() => win.print(), 300)
  }
}
</script>

<template>
  <div :class="['page-grid', showForm ? 'two-columns' : '']">
    <!-- ── 목록 열 ─────────────────────────────────────────────── -->
    <article>
      <!-- 헤더: 액션 -->
      <div class="pip-header">
        <div class="pip-actions">
          <button v-if="!showForm" class="ghost" type="button" :disabled="!summary.total" @click="printReport">{{ t('inventory.printReport') }}</button>
          <button v-if="!showForm" class="ghost" type="button" :disabled="!summary.total" @click="downloadReport">{{ t('inventory.downloadReport') }}</button>
          <button v-if="!showForm" type="button" @click="openAdd">{{ t('common.edit') }}</button>
          <button v-else class="ghost" type="button" @click="closeForm">{{ t('common.exitEdit') }}</button>
        </div>
      </div>

      <!-- 요약 + 정렬 + 필터 -->
      <div class="sort-filter-bar">
        <span class="summary-chip">{{ isFiltered ? t('common.filteredCount', { shown: summary.total, total: summary.categoryTotal }) : t('common.totalCount', { n: summary.total }) }}</span>
        <span v-if="summary.expiring" class="summary-chip chip-danger">{{ t('inventory.summaryExpiring', { count: summary.expiring }) }}</span>
        <span class="filter-sep">|</span>
        <span class="filter-label">{{ t('inventory.sortBy') }}</span>
        <select v-model="sortBy" class="compact-select">
          <option value="name">{{ t('pesticideInventory.sortName') }}</option>
          <option value="expiry">{{ t('inventory.sortExpiry') }}</option>
        </select>
        <button class="ghost compact-btn" type="button" @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'">{{ sortDir === 'asc' ? '↑' : '↓' }}</button>
        <span class="filter-sep">|</span>
        <button
          class="ghost ap-unmatched-btn"
          :class="{ 'ap-unmatched-active': unmatchedOnly }"
          type="button"
          @click="unmatchedOnly = !unmatchedOnly"
        >미연결만 ({{ summary.unmatched }})</button>
      </div>

      <!-- 품목 목록 -->
      <div id="pip-form-top" class="mobile-form-slot"></div>
      <div v-if="displayedItems.length === 0" class="empty-msg">
        {{ unmatchedOnly ? '미연결 품목이 없습니다.' : (showForm ? '저장하면 목록에 표시됩니다.' : '농약 재고 품목이 없습니다. 추가 버튼으로 등록하세요.') }}
      </div>
      <ul v-else class="list clean">
        <li v-for="item in displayedItems" :key="item.id" class="list-item card-like">
          <div>
            <div class="task-card-top">
              <p class="item-title">{{ item.name }}</p>
              <span v-if="item.pesticideType" class="cat-badge" :class="categoryClass(item.pesticideType)">{{ item.pesticideType }}</span>
              <span v-if="item.actionGroup" class="moa-badge" :style="{ background: moaColor(item.actionGroup) }">{{ item.actionGroup }}</span>
            </div>
            <p v-if="item.productName" class="item-meta">{{ item.productName }}</p>

            <p class="muted log-history-label">{{ t('inventory.currentStock') }}</p>
            <ul class="list clean compact">
              <li
                v-for="lot in lotsOf(item)"
                :key="lot.volume + lot.expiryDate"
                class="item-meta inventory-lot"
              >
                {{ lotText(lot) }}
                <span v-if="expiryStatus(lot.expiryDate) === 'expired'" class="pill danger">{{ t('inventory.expired') }}</span>
                <span v-else-if="expiryStatus(lot.expiryDate) === 'soon'" class="pill danger">{{ t('inventory.expiringSoon') }}</span>
              </li>
              <li v-if="!lotsOf(item).length" class="muted">{{ t('inventory.noStock') }}</li>
            </ul>

            <p v-if="item.notes" class="muted">{{ item.notes }}</p>
          </div>

          <div class="row-actions">
            <template v-if="showForm">
              <button :class="{ ghost: expandedId !== item.id }" type="button" @click="toggleExpand(item)">{{ t('inventory.inOut') }}</button>
              <button
                class="ghost"
                :class="{ 'link-btn-active': linkingItemId === item.id }"
                type="button"
                @click="openLink(item.id)"
              >{{ item.actionGroup ? '정보 재연결' : '농약정보 연결' }}</button>
              <button :class="{ ghost: editingId !== item.id }" type="button" @click="editItem(item)">{{ t('common.edit') }}</button>
              <button class="danger" type="button" @click="deleteItem(item)">{{ t('common.delete') }}</button>
            </template>
          </div>

          <!-- 농약정보 연결 패널 -->
          <div v-if="linkingItemId === item.id" class="link-panel">
            <input
              v-model="linkQuery"
              type="text"
              class="link-search-input"
              placeholder="농약명 검색 (공공데이터)"
              @input="searchLinkCandidates(linkQuery)"
            />
            <div v-if="linkResults.length" class="link-results">
              <div
                v-for="r in linkResults"
                :key="`${r.pestiCode}-${r.diseaseUseSeq}`"
                class="link-result-item"
                @click="applyLink(item, r)"
              >
                <span class="link-result-brand">{{ r.brandName }}</span>
                <span v-if="r.pesticideType" class="cat-badge" :class="categoryClass(resolveType(r.pesticideType))">{{ resolveType(r.pesticideType) }}</span>
                <span v-if="r.modeOfAction && r.modeOfAction !== '-'" class="moa-badge" :style="{ background: moaColor(r.modeOfAction) }">{{ r.modeOfAction }}</span>
                <span class="link-result-pest">{{ r.targetPest }}</span>
              </div>
            </div>
            <p v-else-if="linkQuery.trim().length > 1" class="muted" style="font-size:0.82rem; padding:0.4rem 0;">
              검색 결과 없음 — 공공데이터 농약정보를 먼저 가져와야 합니다.
            </p>
          </div>

          <div :id="`pip-form-slot-${item.id}`" class="mobile-form-slot"></div>

          <!-- 입출고 패널 -->
          <div v-if="expandedId === item.id" class="log-panel">
            <form class="stack-form" style="margin-bottom: 1rem;" @submit.prevent="recordTxn(item)">
              <div class="inline-filters">
                <button type="button" :class="{ ghost: txnForm.type !== '입고' }" @click="txnForm.type = '입고'">{{ t('inventory.stockIn') }}</button>
                <button type="button" :class="{ ghost: txnForm.type !== '사용' }" @click="txnForm.type = '사용'">{{ t('inventory.stockOut') }}</button>
              </div>
              <div class="row-actions">
                <label style="flex: 1;">{{ t('inventory.volume') }}
                  <input v-model="txnForm.volume" type="text" :list="`vol-${item.id}`" :placeholder="t('inventory.volumePlaceholder')" />
                  <datalist :id="`vol-${item.id}`">
                    <option v-for="v in volumeOptions(item)" :key="v" :value="v" />
                  </datalist>
                </label>
                <label style="flex: 1;">{{ t('inventory.expiryDate') }}
                  <input v-model="txnForm.expiryDate" type="date" />
                </label>
                <label style="width: 5.5rem;">{{ t('inventory.amount') }}
                  <input v-model="txnForm.amount" type="number" min="0" step="any" />
                </label>
              </div>
              <input v-model="txnForm.note" type="text" :placeholder="t('inventory.txnNote')" />
              <button type="submit">{{ t('inventory.record') }}</button>
            </form>

            <p class="muted log-history-label">{{ t('inventory.history') }}</p>
            <ul class="list clean compact">
              <li v-for="txn in item.txns" :key="txnKey(txn)" class="list-item">
                <div v-if="editingTxnId !== txnKey(txn)" class="log-entry">
                  <span class="log-entry-info">
                    <span class="pill" :class="txn.type === '사용' ? 'danger' : ''">{{ txn.type }}</span>
                    <span class="inventory-txn-amount">{{ txn.type === '사용' ? '−' : '+' }}{{ txn.amount }}</span>
                    <span class="item-meta">{{ txn.volume }} · {{ txn.expiryDate || t('inventory.noExpiry') }}</span>
                    <span class="item-meta">{{ formatTxnDate(txn.date) }}</span>
                    <span v-if="txn.note" class="muted">{{ txn.note }}</span>
                  </span>
                  <span class="log-entry-actions">
                    <button class="ghost icon-btn" type="button" :title="t('common.edit')" :aria-label="t('common.edit')" @click="startEditTxn(txn)">✎</button>
                    <button class="danger icon-btn" type="button" :title="t('common.delete')" :aria-label="t('common.delete')" @click="deleteTxn(item, txn)">✕</button>
                  </span>
                </div>
                <form v-else class="stack-form" @submit.prevent="saveEditTxn(item)">
                  <div class="inline-filters">
                    <button type="button" :class="{ ghost: editTxnForm.type !== '입고' }" @click="editTxnForm.type = '입고'">{{ t('inventory.stockIn') }}</button>
                    <button type="button" :class="{ ghost: editTxnForm.type !== '사용' }" @click="editTxnForm.type = '사용'">{{ t('inventory.stockOut') }}</button>
                  </div>
                  <div class="row-actions">
                    <input v-model="editTxnForm.volume" type="text" style="flex: 1;" :placeholder="t('inventory.volume')" />
                    <input v-model="editTxnForm.expiryDate" type="date" style="flex: 1;" />
                    <input v-model="editTxnForm.amount" type="number" min="0" step="any" style="width: 5.5rem;" />
                  </div>
                  <input v-model="editTxnForm.note" type="text" :placeholder="t('inventory.txnNote')" />
                  <div class="row-actions">
                    <button type="submit">{{ t('common.change') }}</button>
                    <button class="ghost" type="button" @click="cancelEditTxn">{{ t('common.cancel') }}</button>
                  </div>
                </form>
              </li>
              <li v-if="!item.txns?.length" class="muted">{{ t('inventory.noHistory') }}</li>
            </ul>
          </div>
        </li>
      </ul>
    </article>

    <!-- ── 폼 열 ──────────────────────────────────────────────── -->
    <Teleport v-if="showForm" :to="formTarget" :disabled="!isMobile">
    <article v-if="showForm" class="card">
      <div v-if="!editingId" class="inline-filters" style="margin-bottom: 1rem;">
        <button :class="{ ghost: formMode !== 'single' }" type="button" @click="formMode = 'single'">품목 추가</button>
        <button :class="{ ghost: formMode !== 'bulk' }" type="button" @click="formMode = 'bulk'">붙여넣기 일괄추가</button>
      </div>

      <template v-if="formMode === 'bulk' && !editingId">
        <h2>붙여넣기로 일괄 추가</h2>
        <p class="ap-hint">
          <code>상품명</code>, <code>용량</code>, <code>유효기간</code>, <code>수량</code>, <code>비고</code> 열을 탭으로 구분해 붙여넣으세요 (스프레드시트에서 복사). 유효기간은 <code>YYYY-MM-DD</code>, <code>YYYY/MM/DD</code>, <code>YYYYMMDD</code> 모두 가능합니다.<br>
          같은 상품명이 이미 있으면 새 로트(입고)만 추가되고, 없으면 공공데이터 정보를 자동 연결해 새 품목을 만듭니다.
          비고는 품목 메모에 들어가며, 이미 있는 품목이면 같은 문구가 메모에 없을 때만 이어붙입니다.<br>
          현재 설정: <strong>{{ recSettingsStore.settings.bulkImportMode === 'replace' ? '전체 새로 작성' : '기존 목록에 추가' }}</strong>
          <span v-if="recSettingsStore.settings.bulkImportMode === 'replace'" class="muted">(붙여넣는 내용으로 농약재고 전체를 대체합니다 — 설정페이지에서 변경 가능)</span>
          <span v-else class="muted">(설정페이지에서 변경 가능)</span>
        </p>
        <textarea
          v-model="bulkPasteText"
          class="ap-textarea"
          rows="8"
          placeholder="근사미	300ml	2026-10-31	1	"
        ></textarea>
        <div class="ap-input-footer">
          <span v-if="bulkParsedRows.length > 0" class="ap-parse-count">{{ bulkParsedRows.length }}개 항목 인식됨</span>
          <span v-else class="ap-parse-count muted">입력 없음</span>
        </div>
        <div class="row-actions">
          <button type="button" :disabled="bulkImporting || !bulkParsedRows.length" @click="importBulkInventory">
            {{ bulkImporting ? '처리 중...' : (recSettingsStore.settings.bulkImportMode === 'replace' ? '전체 새로 작성' : '일괄 추가') }}
          </button>
        </div>
        <p v-if="bulkImportMessage" class="muted" style="font-size:0.82rem; margin-top:0.5rem;">{{ bulkImportMessage }}</p>
      </template>

      <template v-else>
      <h2>{{ editingId ? t('inventory.editItem') : t('inventory.addItem') }}</h2>
      <form class="stack-form" @submit.prevent="saveItem">
        <label>{{ t('pesticideInventory.name') }}
          <input v-model="form.name" required type="text" :placeholder="t('pesticideInventory.namePlaceholder')" @input="onNameInput" />
        </label>
        <div v-if="invMatchResults.length" class="inv-api-panel">
          <div
            v-for="r in invMatchResults"
            :key="`${r.pestiCode}-${r.diseaseUseSeq}`"
            class="inv-api-item"
            @mousedown.prevent="applyInvMatch(r)"
          >
            <span class="inv-api-brand">{{ r.brandName }}</span>
            <span v-if="r.pesticideType" class="cat-badge" :class="categoryClass(resolveType(r.pesticideType))">{{ resolveType(r.pesticideType) }}</span>
            <span v-if="r.modeOfAction && r.modeOfAction !== '-'" class="moa-badge" :style="{ background: moaColor(r.modeOfAction) }">{{ r.modeOfAction }}</span>
            <span class="inv-api-pest">{{ r.targetPest }}</span>
          </div>
        </div>
        <label>{{ t('pesticideInventory.pesticideType') }}
          <select v-model="form.pesticideType">
            <option v-for="tp in pesticideTypes" :key="tp" :value="tp">{{ tp }}</option>
          </select>
        </label>
        <label>{{ t('pesticideInventory.actionGroup') }}
          <input v-model="form.actionGroup" type="text" :placeholder="t('pesticideInventory.actionGroupPlaceholder')" />
        </label>
        <label>{{ t('pesticideInventory.productName') }}
          <input v-model="form.productName" type="text" :placeholder="t('pesticideInventory.productNamePlaceholder')" />
        </label>
        <label>{{ t('inventory.notes') }}
          <textarea v-model="form.notes" rows="2" />
        </label>
        <div class="row-actions">
          <button type="submit">{{ editingId ? t('common.change') : t('common.add') }}</button>
          <button v-if="editingId" class="ghost" type="button" @click="newEntry">{{ t('inventory.newEntry') }}</button>
        </div>
      </form>
      <p class="muted" style="font-size: 0.8rem;">{{ t('inventory.inOut') }}로 규격·유효기간별 재고를 등록·관리합니다.</p>
      </template>
    </article>
    </Teleport>
  </div>
</template>

<style scoped>

/* OpenAPI search panel */
.inv-api-panel {
  display: flex; flex-direction: column; gap: 0.2rem;
  max-height: 220px; overflow-y: auto;
  border: 1px solid var(--primary); border-radius: 0.45rem;
  background: var(--bg);
  margin-top: -0.25rem; margin-bottom: 0.25rem;
}
.inv-api-item {
  display: flex; align-items: center; flex-wrap: wrap; gap: 0.35rem;
  padding: 0.38rem 0.65rem; cursor: pointer; font-size: 0.83rem;
  border-bottom: 1px solid var(--line);
}
.inv-api-item:last-child { border-bottom: none; }
.inv-api-item:hover { background: var(--surface-strong); }
.inv-api-brand { font-weight: 600; }
.inv-api-pest { font-size: 0.76rem; color: var(--muted); margin-left: auto; }

.empty-msg { color: var(--muted); font-size: 0.875rem; text-align: center; padding: 2rem; }

/* 농약정보 연결 버튼 */
.link-btn-active { background: var(--primary) !important; color: var(--primary-ink) !important; border-color: var(--primary) !important; }

/* 농약정보 연결 패널 */
.link-panel {
  margin-top: 0.5rem;
  border: 1px solid var(--primary);
  border-radius: 0.5rem;
  overflow: hidden;
}
.link-search-input {
  width: 100%;
  border: none;
  border-bottom: 1px solid var(--line);
  border-radius: 0;
  padding: 0.45rem 0.7rem;
  font-size: 0.85rem;
  font-family: inherit;
  background: var(--bg);
  outline: none;
  box-sizing: border-box;
}
.link-search-input:focus { background: var(--surface); }
.link-results { max-height: 200px; overflow-y: auto; }
.link-result-item {
  display: flex; align-items: center; flex-wrap: wrap; gap: 0.35rem;
  padding: 0.38rem 0.65rem; cursor: pointer; font-size: 0.83rem;
  border-bottom: 1px solid var(--line);
}
.link-result-item:last-child { border-bottom: none; }
.link-result-item:hover { background: var(--surface-strong); }
.link-result-brand { font-weight: 600; }
.link-result-pest { font-size: 0.76rem; color: var(--muted); margin-left: auto; }
</style>

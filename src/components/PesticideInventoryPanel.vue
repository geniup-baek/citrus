<script setup>
import { computed, nextTick, reactive, ref } from 'vue'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { useFarmStore } from '../stores/farmStore'
import { useLocaleStore } from '../stores/localeStore'
import { confirm } from '../composables/useConfirm'
import { searchFromFullCache } from '../services/pesticide.js'
import { moaColor } from '../services/recommend.js'
import { usePesticideTypes } from '../composables/usePesticideTypes.js'
import { useIsMobile } from '../composables/useIsMobile.js'

const store      = useFarmStore()
const localeStr  = useLocaleStore()
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
const editingId    = ref('')
const expandedId   = ref('')
const sortBy       = ref('name')
const sortDir      = ref('asc')
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
    total:    items.length,
    expiring: items.reduce((s, i) => s + expiringLotCount(i), 0),
  }
})

// ── 폼 ───────────────────────────────────────────────────────────────────────
function clearForm() {
  Object.assign(form, {
    id: '', name: '',
    pesticideType: pesticideTypes.value[0] ?? '살충제',
    actionGroup: '', productName: '', notes: '',
  })
  editingId.value      = ''
  invMatchResults.value = []
}

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
  showForm.value   = true
  scrollToItem(`pip-form-slot-${item.id}`)
}

function closeForm() { clearForm(); showForm.value = false }

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
    t('inventory.name'), t('inventory.pesticideType'),
    t('inventory.actionGroup'), t('inventory.productName'),
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
</script>

<template>
  <div :class="['page-grid', showForm ? 'two-columns' : '']">
    <!-- ── 목록 열 ─────────────────────────────────────────────── -->
    <article class="card">
      <!-- 헤더: 요약 + 액션 -->
      <div class="pip-header">
        <div class="pip-summary">
          <span class="summary-chip">{{ t('inventory.summaryTotal', { count: summary.total }) }}</span>
          <span v-if="summary.expiring" class="summary-chip chip-danger">{{ t('inventory.summaryExpiring', { count: summary.expiring }) }}</span>
        </div>
        <div class="pip-actions">
          <select v-model="sortBy" class="compact-select">
            <option value="name">{{ t('inventory.sortName') }}</option>
            <option value="expiry">{{ t('inventory.sortExpiry') }}</option>
          </select>
          <button class="ghost compact-btn" type="button" @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'">{{ sortDir === 'asc' ? '↑' : '↓' }}</button>
          <button v-if="!showForm" class="ghost" type="button" :disabled="!summary.total" @click="downloadReport">{{ t('inventory.downloadReport') }}</button>
          <button v-if="!showForm" type="button" @click="openAdd">편집</button>
          <button v-else class="ghost" type="button" @click="closeForm">편집종료</button>
        </div>
      </div>

      <!-- 품목 목록 -->
      <div id="pip-form-top" class="mobile-form-slot"></div>
      <div v-if="displayedItems.length === 0" class="empty-msg">
        {{ showForm ? '저장하면 목록에 표시됩니다.' : '농약 재고 품목이 없습니다. 추가 버튼으로 등록하세요.' }}
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
            <button :class="{ ghost: expandedId !== item.id }" type="button" @click="toggleExpand(item)">{{ t('inventory.inOut') }}</button>
            <button
              class="ghost"
              :class="{ 'link-btn-active': linkingItemId === item.id }"
              type="button"
              @click="openLink(item.id)"
            >{{ item.actionGroup ? '정보 재연결' : '농약정보 연결' }}</button>
            <template v-if="showForm">
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
              placeholder="농약명 검색 (OpenAPI 데이터)"
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
              검색 결과 없음 — OpenAPI 농약정보를 먼저 가져와야 합니다.
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
      <h2>{{ editingId ? t('inventory.editItem') : t('inventory.addItem') }}</h2>
      <form class="stack-form" @submit.prevent="saveItem">
        <label>{{ t('inventory.name') }}
          <input v-model="form.name" required type="text" :placeholder="t('inventory.namePlaceholder')" @input="onNameInput" />
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
        <label>{{ t('inventory.pesticideType') }}
          <select v-model="form.pesticideType">
            <option v-for="tp in pesticideTypes" :key="tp" :value="tp">{{ tp }}</option>
          </select>
        </label>
        <label>{{ t('inventory.actionGroup') }}
          <input v-model="form.actionGroup" type="text" :placeholder="t('inventory.actionGroupPlaceholder')" />
        </label>
        <label>{{ t('inventory.productName') }}
          <input v-model="form.productName" type="text" :placeholder="t('inventory.productNamePlaceholder')" />
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
    </article>
    </Teleport>
  </div>
</template>

<style scoped>
.pip-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.pip-summary { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }
.pip-actions { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }

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
.cat-badge {
  font-size: 0.68rem; padding: 0.12rem 0.45rem; border-radius: 999px;
  font-weight: 600; border: 1px solid; white-space: nowrap;
}
.cat-fungicide   { background: #f0fdf4; color: #166534; border-color: #bbf7d0; }
.cat-insecticide { background: #fff7ed; color: #9a3412; border-color: #fed7aa; }
.cat-miticide    { background: #eff6ff; color: #1e40af; border-color: #bfdbfe; }
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
.moa-badge {
  display: inline-block; color: #fff; font-size: 0.7rem; font-weight: 700;
  padding: 0.15rem 0.45rem; border-radius: 4px; letter-spacing: 0.02em; white-space: nowrap;
}
.link-result-pest { font-size: 0.76rem; color: var(--muted); margin-left: auto; }
</style>

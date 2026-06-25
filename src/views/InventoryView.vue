<script setup>
import { computed, reactive, ref } from 'vue'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { useFarmStore } from '../stores/farmStore'
import { useLocaleStore } from '../stores/localeStore'

const store = useFarmStore()
const localeStore = useLocaleStore()

const showForm = ref(false)
const editingId = ref('')
const expandedId = ref('')

const sortBy = ref('name')
const sortDir = ref('asc')
const filterCategory = ref('all')

const EXPIRY_SOON_DAYS = 30

const form = reactive({
  id: '',
  name: '',
  category: '비료',
  unit: '',
  quantity: 0,
  minQuantity: 0,
  expiryDate: '',
  notes: '',
})

const txnForm = reactive({
  type: '입고',
  amount: '',
  note: '',
})

// ── 상태 판정 ────────────────────────────────────────────────────────────────
function isLowStock(item) {
  return item.minQuantity > 0 && item.quantity <= item.minQuantity
}

function expiryStatus(item) {
  if (!item.expiryDate) return ''
  const d = parseISO(item.expiryDate)
  if (Number.isNaN(d.getTime())) return ''
  const diff = differenceInCalendarDays(d, new Date())
  if (diff < 0) return 'expired'
  if (diff <= EXPIRY_SOON_DAYS) return 'soon'
  return ''
}

// ── 목록 ─────────────────────────────────────────────────────────────────────
const displayedItems = computed(() => {
  let list = [...store.state.inventory]

  if (filterCategory.value !== 'all') {
    list = list.filter((item) => item.category === filterCategory.value)
  }

  list.sort((a, b) => {
    let va, vb
    if (sortBy.value === 'quantity') {
      va = a.quantity
      vb = b.quantity
      return sortDir.value === 'asc' ? va - vb : vb - va
    }
    if (sortBy.value === 'expiry') {
      va = a.expiryDate || '9999-12-31'
      vb = b.expiryDate || '9999-12-31'
    } else {
      va = a.name
      vb = b.name
    }
    return sortDir.value === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
  })

  return list
})

const summary = computed(() => {
  const items = store.state.inventory
  return {
    total: items.length,
    low: items.filter((item) => isLowStock(item)).length,
    expiring: items.filter((item) => expiryStatus(item) !== '').length,
  }
})

// ── 폼 ───────────────────────────────────────────────────────────────────────
function clearForm() {
  form.id = ''
  form.name = ''
  form.category = '비료'
  form.unit = ''
  form.quantity = 0
  form.minQuantity = 0
  form.expiryDate = ''
  form.notes = ''
  editingId.value = ''
}

function openAdd() {
  clearForm()
  showForm.value = true
}

function editItem(item) {
  form.id = item.id
  form.name = item.name
  form.category = item.category
  form.unit = item.unit
  form.quantity = item.quantity
  form.minQuantity = item.minQuantity
  form.expiryDate = item.expiryDate || ''
  form.notes = item.notes || ''
  editingId.value = item.id
  showForm.value = true
}

function closeForm() {
  clearForm()
  showForm.value = false
}

async function saveItem() {
  await store.upsertInventoryItem({
    id: form.id || undefined,
    name: form.name,
    category: form.category,
    unit: form.unit,
    quantity: Number(form.quantity),
    minQuantity: Number(form.minQuantity),
    expiryDate: form.expiryDate,
    notes: form.notes,
  })
  clearForm()
  showForm.value = false
}

async function deleteItem(item) {
  await store.removeInventoryItem(item.id)
  if (expandedId.value === item.id) expandedId.value = ''
}

// ── 입출고 ───────────────────────────────────────────────────────────────────
function toggleExpand(item) {
  if (expandedId.value === item.id) {
    expandedId.value = ''
  } else {
    expandedId.value = item.id
    txnForm.type = '입고'
    txnForm.amount = ''
    txnForm.note = ''
  }
}

async function recordTxn(item) {
  const amount = Number(txnForm.amount)
  if (!amount || amount <= 0) return
  await store.addInventoryTxn(item.id, txnForm.type, amount, txnForm.note)
  txnForm.amount = ''
  txnForm.note = ''
}

async function deleteTxn(item, txn) {
  await store.removeInventoryTxn(item.id, txn.id || txn.date)
}

function txnKey(txn) {
  return txn.id || txn.date
}

function formatTxnDate(dateStr) {
  try {
    return format(new Date(dateStr), 'MM/dd HH:mm')
  } catch {
    return dateStr
  }
}

clearForm()
</script>

<template>
  <section :class="['page-grid', showForm ? 'two-columns' : '']">
    <article class="card">
      <div class="row-actions align-start">
        <h2>{{ localeStore.t('inventory.overview') }}</h2>
        <button v-if="!showForm" type="button" @click="openAdd">{{ localeStore.t('inventory.addItem') }}</button>
        <button v-else class="ghost" type="button" @click="closeForm">{{ localeStore.t('common.exitEdit') }}</button>
      </div>

      <!-- 요약 -->
      <div class="summary-strip">
        <span class="summary-chip">{{ localeStore.t('inventory.summaryTotal', { count: summary.total }) }}</span>
        <span v-if="summary.low" class="summary-chip chip-danger">{{ localeStore.t('inventory.summaryLow', { count: summary.low }) }}</span>
        <span v-if="summary.expiring" class="summary-chip chip-danger">{{ localeStore.t('inventory.summaryExpiring', { count: summary.expiring }) }}</span>
      </div>

      <!-- 정렬·필터 -->
      <div class="sort-filter-bar">
        <span class="filter-label">{{ localeStore.t('inventory.sortBy') }}</span>
        <select v-model="sortBy" class="compact-select">
          <option value="name">{{ localeStore.t('inventory.sortName') }}</option>
          <option value="quantity">{{ localeStore.t('inventory.sortQuantity') }}</option>
          <option value="expiry">{{ localeStore.t('inventory.sortExpiry') }}</option>
        </select>
        <button
          class="ghost compact-btn"
          type="button"
          @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'"
        >{{ sortDir === 'asc' ? '↑' : '↓' }}</button>
        <span class="filter-sep">|</span>
        <span class="filter-label">{{ localeStore.t('inventory.filterCategory') }}</span>
        <select v-model="filterCategory" class="compact-select">
          <option value="all">{{ localeStore.t('inventory.filterAll') }}</option>
          <option value="비료">{{ localeStore.t('inventory.categoryFertilizer') }}</option>
          <option value="농약">{{ localeStore.t('inventory.categoryPesticide') }}</option>
        </select>
      </div>

      <ul class="list clean">
        <li
          v-for="item in displayedItems"
          :key="item.id"
          class="list-item card-like"
          :class="{ 'task-overdue': isLowStock(item) }"
        >
          <div>
            <div class="task-card-top">
              <p class="item-title">{{ item.name }}</p>
              <span class="pill">{{ item.category }}</span>
              <span v-if="isLowStock(item)" class="pill danger">{{ localeStore.t('inventory.lowStock') }}</span>
              <span v-if="expiryStatus(item) === 'expired'" class="pill danger">{{ localeStore.t('inventory.expired') }}</span>
              <span v-else-if="expiryStatus(item) === 'soon'" class="pill danger">{{ localeStore.t('inventory.expiringSoon') }}</span>
            </div>
            <p class="item-meta">
              {{ localeStore.t('inventory.stockLabel', { quantity: item.quantity, unit: item.unit }) }}
              <template v-if="item.minQuantity > 0"> · {{ localeStore.t('inventory.minLabel', { min: item.minQuantity }) }}</template>
              <template v-if="item.expiryDate"> · {{ localeStore.t('inventory.expiryDate') }} {{ item.expiryDate }}</template>
            </p>
            <p v-if="item.notes" class="muted">{{ item.notes }}</p>
          </div>

          <div class="row-actions">
            <button class="ghost" type="button" @click="toggleExpand(item)">{{ localeStore.t('inventory.inOut') }}</button>
            <template v-if="showForm">
              <button class="ghost" type="button" @click="editItem(item)">{{ localeStore.t('common.edit') }}</button>
              <button class="danger" type="button" @click="deleteItem(item)">{{ localeStore.t('common.delete') }}</button>
            </template>
          </div>

          <!-- 입출고 패널 -->
          <div v-if="expandedId === item.id" class="inventory-txn-panel">
            <form class="inventory-txn-form" @submit.prevent="recordTxn(item)">
              <div class="inline-filters">
                <button type="button" :class="{ ghost: txnForm.type !== '입고' }" @click="txnForm.type = '입고'">{{ localeStore.t('inventory.stockIn') }}</button>
                <button type="button" :class="{ ghost: txnForm.type !== '사용' }" @click="txnForm.type = '사용'">{{ localeStore.t('inventory.stockOut') }}</button>
              </div>
              <div class="row-actions">
                <input v-model="txnForm.amount" type="number" min="0" step="any" :placeholder="localeStore.t('inventory.amount')" />
                <input v-model="txnForm.note" type="text" :placeholder="localeStore.t('inventory.txnNote')" />
                <button type="submit">{{ localeStore.t('inventory.record') }}</button>
              </div>
            </form>

            <p class="muted inventory-history-label">{{ localeStore.t('inventory.history') }}</p>
            <ul class="list clean compact">
              <li v-for="txn in item.txns" :key="txnKey(txn)" class="list-item inventory-txn-item">
                <span class="inventory-txn-info">
                  <span class="pill" :class="txn.type === '사용' ? 'danger' : ''">{{ txn.type }}</span>
                  <span class="inventory-txn-amount">{{ txn.type === '사용' ? '−' : '+' }}{{ txn.amount }}</span>
                  <span class="item-meta">{{ formatTxnDate(txn.date) }}</span>
                  <span v-if="txn.note" class="muted">{{ txn.note }}</span>
                </span>
                <button class="danger icon-btn" type="button" :title="localeStore.t('common.delete')" @click="deleteTxn(item, txn)">✕</button>
              </li>
              <li v-if="!item.txns?.length" class="muted">{{ localeStore.t('inventory.noHistory') }}</li>
            </ul>
          </div>
        </li>
        <li v-if="!displayedItems.length" class="muted">{{ localeStore.t('inventory.noItems') }}</li>
      </ul>
    </article>

    <article v-if="showForm" class="card">
      <h2>{{ editingId ? localeStore.t('inventory.editItem') : localeStore.t('inventory.addItem') }}</h2>
      <form class="stack-form" @submit.prevent="saveItem">
        <label>{{ localeStore.t('inventory.name') }}
          <input v-model="form.name" required type="text" :placeholder="localeStore.t('inventory.namePlaceholder')" />
        </label>
        <label>{{ localeStore.t('inventory.category') }}
          <select v-model="form.category">
            <option value="비료">{{ localeStore.t('inventory.categoryFertilizer') }}</option>
            <option value="농약">{{ localeStore.t('inventory.categoryPesticide') }}</option>
          </select>
        </label>
        <label>{{ localeStore.t('inventory.unit') }}
          <input v-model="form.unit" required type="text" :placeholder="localeStore.t('inventory.unitPlaceholder')" />
        </label>
        <label v-if="!editingId">{{ localeStore.t('inventory.initialQuantity') }}
          <input v-model="form.quantity" type="number" min="0" step="any" />
        </label>
        <label>{{ localeStore.t('inventory.minQuantity') }}
          <input v-model="form.minQuantity" type="number" min="0" step="any" />
        </label>
        <p class="muted" style="font-size: 0.78rem; margin-top: -0.4rem;">{{ localeStore.t('inventory.minQuantityHint') }}</p>
        <label>{{ localeStore.t('inventory.expiryDate') }}
          <input v-model="form.expiryDate" type="date" />
        </label>
        <label>{{ localeStore.t('inventory.notes') }}
          <textarea v-model="form.notes" rows="3" />
        </label>
        <div class="row-actions">
          <button type="submit">{{ editingId ? localeStore.t('common.change') : localeStore.t('common.add') }}</button>
          <button class="ghost" type="button" @click="clearForm">{{ localeStore.t('common.reset') }}</button>
        </div>
      </form>
      <p v-if="editingId" class="muted" style="font-size: 0.8rem;">
        {{ localeStore.t('inventory.quantity') }}: {{ store.state.inventory.find((i) => i.id === editingId)?.quantity }}
        — {{ localeStore.t('inventory.inOut') }}로만 변경됩니다.
      </p>
    </article>
  </section>
</template>

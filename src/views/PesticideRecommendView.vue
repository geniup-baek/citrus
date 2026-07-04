<script setup>
import { ref, computed, nextTick, watch, onMounted } from 'vue'
import { useTreatmentStore } from '../stores/treatmentStore.js'
import { useRecommendSettingsStore } from '../stores/recommendSettingsStore.js'
import { useFarmStore } from '../stores/farmStore.js'
import { useAvailablePesticideStore, parsePurchaseText } from '../stores/availablePesticideStore.js'
import { getRecommendations, moaColor } from '../services/recommend.js'
import { searchFromFullCache } from '../services/pesticide.js'
import PesticideInventoryPanel from '../components/PesticideInventoryPanel.vue'
import { usePesticideTypes } from '../composables/usePesticideTypes.js'
import { useIsMobile } from '../composables/useIsMobile.js'

const treatStore    = useTreatmentStore()
const settingsStore = useRecommendSettingsStore()
const farmStore     = useFarmStore()
const apStore       = useAvailablePesticideStore()

const activeTab = ref('history')

// ── 오늘 날짜 (YYYY-MM-DD) ─────────────────────────────────────────────────
function today() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// ── 방제 이력 Tab ──────────────────────────────────────────────────────────
const fDate     = ref(today())
const fBrand    = ref('')
const fMoa      = ref('')
const fCategory = ref('')
const fPest     = ref('')
const fMemo     = ref('')
const formError = ref('')
const saving    = ref(false)
const { isMobile } = useIsMobile()

const showHistoryForm = ref(false)
const editingId     = ref(null)
const deleteConfirm = ref(null)

const histFormTarget = computed(() =>
  editingId.value && treatStore.treatments.some(t => t.id === editingId.value)
    ? `#hist-form-slot-${editingId.value}`
    : '#hist-form-top'
)

function resetForm() {
  editingId.value = null
  fDate.value     = today()
  fBrand.value    = ''
  fMoa.value      = ''
  fCategory.value = ''
  fPest.value     = ''
  fMemo.value     = ''
  formError.value = ''
  deleteConfirm.value = null
}

function startEdit(t) {
  showHistoryForm.value = true
  editingId.value       = t.id
  fDate.value           = t.date
  fBrand.value          = t.brandName
  fMoa.value            = t.moa       ?? ''
  fCategory.value       = t.category  ?? ''
  fPest.value           = t.targetPest ?? ''
  fMemo.value           = t.memo       ?? ''
  formError.value       = ''
  deleteConfirm.value   = null
  histLinkId.value      = null
  if (isMobile.value) {
    nextTick(() => {
      const el = document.getElementById(`hist-form-slot-${t.id}`)
      ;(el?.closest('li') ?? el)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
}

async function submitTreatment() {
  formError.value = ''
  if (!fDate.value)  { formError.value = '날짜를 입력하세요.'; return }
  if (!fBrand.value) { formError.value = '농약을 선택하세요.'; return }
  saving.value = true
  const record = {
    date:       fDate.value,
    brandName:  fBrand.value,
    moa:        fMoa.value,
    category:   fCategory.value,
    targetPest: fPest.value.trim(),
    memo:       fMemo.value.trim(),
  }
  try {
    if (editingId.value) {
      await treatStore.updateTreatment(editingId.value, record)
    } else {
      await treatStore.addTreatment(record)
    }
    resetForm()
  } catch (e) {
    formError.value = e.message
  } finally {
    saving.value = false
  }
}

async function confirmDelete(id) {
  if (deleteConfirm.value === id) {
    if (editingId.value === id) resetForm()
    await treatStore.deleteTreatment(id)
    deleteConfirm.value = null
  } else {
    deleteConfirm.value = id
  }
}

function newHistoryEntry() {
  resetForm()
  if (isMobile.value) {
    nextTick(() => document.getElementById('hist-form-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
}

// ── 방제이력 농약정보 연결 (폼) ────────────────────────────────────────────────
const formLinkResults = ref([])

function onFormBrandInput(val) {
  const q = val.trim()
  if (!q) { formLinkResults.value = []; return }
  const result = searchFromFullCache({ pestName: q, page: 1, pageSize: 10 })
  formLinkResults.value = result?.list ?? []
}

function applyFormLink(apiItem) {
  fBrand.value = apiItem.brandName
  if (apiItem.pesticideType)                                 fCategory.value = normCat(apiItem.pesticideType)
  if (apiItem.modeOfAction && apiItem.modeOfAction !== '-')  fMoa.value      = apiItem.modeOfAction
  formLinkResults.value = []
}

// ── 방제이력 농약정보 연결 (목록 항목) ─────────────────────────────────────────
const histLinkId      = ref(null)
const histLinkQuery   = ref('')
const histLinkResults = ref([])

function openHistLink(id) {
  if (histLinkId.value === id) {
    histLinkId.value      = null
    histLinkQuery.value   = ''
    histLinkResults.value = []
    return
  }
  histLinkId.value      = id
  histLinkQuery.value   = ''
  histLinkResults.value = []
}

function searchHistLinkCandidates(query) {
  if (!query.trim()) { histLinkResults.value = []; return }
  const result = searchFromFullCache({ pestName: query.trim(), page: 1, pageSize: 12 })
  histLinkResults.value = result?.list ?? []
}

async function applyHistLink(treatment, apiItem) {
  const moa      = (apiItem.modeOfAction && apiItem.modeOfAction !== '-') ? apiItem.modeOfAction : (treatment.moa || '')
  const category = normCat(apiItem.pesticideType) || treatment.category || ''
  await treatStore.updateTreatment(treatment.id, {
    date:       treatment.date,
    brandName:  apiItem.brandName || treatment.brandName,
    moa,
    category,
    targetPest: treatment.targetPest || '',
    memo:       treatment.memo || '',
  })
  histLinkId.value      = null
  histLinkQuery.value   = ''
  histLinkResults.value = []
}

function formatDate(d) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${y}.${m}.${day}`
}

// ── 농약 추천 Tab ──────────────────────────────────────────────────────────
const recPest   = ref('')
const recDate   = ref(today())
const recResult = ref(null)

const recPests = computed(() => {
  const set = new Set()
  for (const p of apStore.availableList) {
    for (const pest of p.targetPests) {
      set.add(pest.replace(/\(.*?\)/g, '').trim())
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'ko'))
})

function runRecommend() {
  if (!recPest.value.trim()) { recResult.value = null; return }
  recResult.value = getRecommendations({
    targetPest: recPest.value.trim(),
    treatments: treatStore.treatments,
    settings:   settingsStore.settings,
    today:      recDate.value || today(),
    pesticides: apStore.availableList,
  })
}

// 이력이 바뀌면 추천 결과도 갱신
watch(() => treatStore.treatments.length, () => {
  if (recResult.value) runRecommend()
})

function hasStock(brandName) {
  return (inventoryStockMap.value[brandName]?.length ?? 0) > 0
}

const sortedRecommended = computed(() =>
  recResult.value
    ? [...recResult.value.recommended].sort((a, b) => hasStock(b.brandName) - hasStock(a.brandName))
    : [],
)

const sortedExcluded = computed(() =>
  recResult.value
    ? [...recResult.value.excluded].sort((a, b) => hasStock(b.brandName) - hasStock(a.brandName))
    : [],
)

// ── computed helpers ───────────────────────────────────────────────────────
const { resolveType: normCat } = usePesticideTypes()

const categoryClass = (cat) => ({
  '살균제': 'cat-fungicide',
  '살비제': 'cat-miticide',
  '살충제': 'cat-insecticide',
}[cat] ?? '')

const categoryClassFor = (cat) => categoryClass(normCat(cat))

// ── 가용농약 Tab ───────────────────────────────────────────────────────────
const apInputText    = ref('')
const apFilter        = ref('')
const apSourceFilter  = ref('all')   // 'all' | 'purchase' | 'inventory'
const apUnmatchedOnly = ref(false)
const matchingItemId = ref(null)   // 수동 연결 패널이 열린 아이템 id
const matchQuery     = ref('')
const matchResults   = ref([])
const apBuilding     = ref(false)

const inventoryPesticides = computed(() =>
  (farmStore.state?.inventory ?? []).filter(i => i.category === '농약'),
)

function fmtExpiry(date) {
  if (!date) return ''
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return date
  return `~${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}`
}

function stockLotLabel(lot) {
  return [lot.vol === '기본' ? '' : lot.vol, lot.expiry ? fmtExpiry(lot.expiry) : '', `${lot.qty}개`]
    .filter(Boolean).join(' ')
}

// 재고 수량 맵: item.name → [{vol, expiry, qty}] (lot별 재고 > 0인 것만)
const inventoryStockMap = computed(() => {
  const map = {}
  for (const item of inventoryPesticides.value) {
    const byLot = {}
    for (const t of item.txns ?? []) {
      const key = `${t.volume || '기본'}__${t.expiryDate || ''}`
      byLot[key] = (byLot[key] ?? 0) + (t.type === '입고' ? t.amount : -t.amount)
    }
    const lots = Object.entries(byLot)
      .filter(([, qty]) => qty > 0)
      .map(([key, qty]) => { const [vol, expiry] = key.split('__'); return { vol, expiry, qty } })
    if (lots.length) map[item.name] = lots
  }
  return map
})

const parsedCount = computed(() => parsePurchaseText(apInputText.value).length)

const apStats = computed(() => {
  const total   = apStore.availableList.length
  const matched = apStore.availableList.filter(p => p.matchSource).length
  return { total, matched, unmatched: total - matched }
})

const apSourceCounts = computed(() => ({
  purchase: apStore.availableList.filter(p => p.source === 'purchase').length,
  inventory: apStore.availableList.filter(p => p.source === 'inventory').length,
}))

const filteredApList = computed(() => {
  let list = apStore.availableList
  if (apSourceFilter.value !== 'all') list = list.filter(p => p.source === apSourceFilter.value)
  if (apUnmatchedOnly.value) list = list.filter(p => !p.matchSource)
  const q = apFilter.value.trim().toLowerCase()
  if (q) list = list.filter(p =>
    p.brandName.toLowerCase().includes(q) ||
    normCat(p.category).includes(q) ||
    p.moa.toLowerCase().includes(q) ||
    p.targetPests.some(t => t.toLowerCase().includes(q)),
  )
  return [...list].sort((a, b) => a.brandName.localeCompare(b.brandName, 'ko'))
})

function matchLabel(src) {
  if (src === 'api')       return '자동'
  if (src === 'manual')    return '수동'
  if (src === 'inventory') return '재고'
  return '미연결'
}

async function buildApList() {
  apStore.savePurchaseInput(apInputText.value)
  apBuilding.value = true
  try { apStore.buildList(inventoryPesticides.value) }
  finally { apBuilding.value = false }
}

function openManualMatch(itemId) {
  if (matchingItemId.value === itemId) {
    matchingItemId.value = null
    matchQuery.value = ''
    matchResults.value = []
    return
  }
  matchingItemId.value = itemId
  matchQuery.value = ''
  matchResults.value = []
}

function searchApiCandidates(query) {
  if (!query.trim()) { matchResults.value = []; return }
  const result = searchFromFullCache({ pestName: query.trim(), page: 1, pageSize: 12 })
  matchResults.value = result?.list ?? []
}

function applyMatch(itemId, apiItem) {
  apStore.applyManualMatch(itemId, apiItem)
  matchingItemId.value = null
  matchQuery.value = ''
  matchResults.value = []
}

onMounted(() => {
  treatStore.init()
  apStore.init()
  apInputText.value = apStore.purchaseInput
})
</script>

<template>
  <div class="card recommend-view">
    <div class="view-header">
      <h2>농약 방제 추천</h2>
      <p class="subtitle">방제 이력 기반 작용기작 중복 방지 · 구입 가능 농약 목록 기준</p>
    </div>

    <!-- Tabs -->
    <div class="tab-bar">
      <button class="tab-btn" :class="{ active: activeTab === 'history' }"   @click="activeTab = 'history'">방제 이력</button>
      <button class="tab-btn" :class="{ active: activeTab === 'peststock' }" @click="activeTab = 'peststock'">농약재고</button>
      <button class="tab-btn" :class="{ active: activeTab === 'avail' }"     @click="activeTab = 'avail'">가용농약</button>
      <button class="tab-btn" :class="{ active: activeTab === 'recommend' }" @click="activeTab = 'recommend'">농약 추천</button>
      <button class="tab-btn" :class="{ active: activeTab === 'settings' }"  @click="activeTab = 'settings'">추천 설정</button>
    </div>

    <!-- ═══ 방제 이력 ═══════════════════════════════════════════════════════ -->
    <section v-if="activeTab === 'history'">
      <div :class="['page-grid', showHistoryForm ? 'two-columns' : '']">

        <!-- 목록 -->
        <article class="card">
          <div class="pip-header">
            <div class="pip-summary">
              <span v-if="treatStore.treatments.length" class="summary-chip">{{ treatStore.treatments.length }}건</span>
            </div>
            <div class="pip-actions">
              <button v-if="!showHistoryForm" type="button" @click="showHistoryForm = true">편집</button>
              <button v-else class="ghost" type="button" @click="resetForm(); showHistoryForm = false">편집종료</button>
            </div>
          </div>
          <div id="hist-form-top" class="mobile-form-slot"></div>
          <div v-if="treatStore.treatments.length === 0" class="empty-msg">
            {{ showHistoryForm ? '저장하면 목록에 표시됩니다.' : '기록된 방제 이력이 없습니다.' }}
          </div>
          <ul v-else class="list clean">
            <template v-for="t in treatStore.treatments" :key="t.id">
              <li class="list-item card-like">
                <div>
                  <div class="task-card-top">
                    <p class="item-title">{{ t.brandName }}</p>
                    <span v-if="t.moa" class="moa-badge" :style="{ background: moaColor(t.moa) }">{{ t.moa }}</span>
                    <span v-if="t.category" class="cat-badge" :class="categoryClass(t.category)">{{ t.category }}</span>
                  </div>
                  <p class="item-meta">{{ formatDate(t.date) }}</p>
                  <p v-if="t.targetPest || t.memo" class="item-meta">
                    <span v-if="t.targetPest">{{ t.targetPest }}</span>
                    <span v-if="t.targetPest && t.memo"> · </span>
                    <span v-if="t.memo" class="muted">{{ t.memo }}</span>
                  </p>
                </div>
                <div class="row-actions">
                  <button
                    class="ghost"
                    :class="{ 'link-btn-active': histLinkId === t.id }"
                    type="button"
                    @click="openHistLink(t.id)"
                  >{{ t.moa ? '정보 재연결' : '농약정보 연결' }}</button>
                  <template v-if="showHistoryForm">
                    <button :class="{ ghost: editingId !== t.id }" type="button" @click="editingId === t.id ? resetForm() : startEdit(t)">편집</button>
                    <button class="danger" type="button" @click="confirmDelete(t.id)">{{ deleteConfirm === t.id ? '확인' : '삭제' }}</button>
                  </template>
                </div>
                <!-- 농약정보 연결 패널 -->
                <div v-if="histLinkId === t.id" class="link-panel">
                  <input
                    v-model="histLinkQuery"
                    type="text"
                    class="link-search-input"
                    placeholder="농약명 검색 (OpenAPI 데이터)"
                    @input="searchHistLinkCandidates(histLinkQuery)"
                  />
                  <div v-if="histLinkResults.length" class="link-results">
                    <div
                      v-for="r in histLinkResults"
                      :key="`${r.pestiCode}-${r.diseaseUseSeq}`"
                      class="link-result-item"
                      @click="applyHistLink(t, r)"
                    >
                      <span class="link-result-brand">{{ r.brandName }}</span>
                      <span v-if="r.pesticideType" class="cat-badge" :class="categoryClass(normCat(r.pesticideType))">{{ normCat(r.pesticideType) }}</span>
                      <span v-if="r.modeOfAction && r.modeOfAction !== '-'" class="moa-badge" :style="{ background: moaColor(r.modeOfAction) }">{{ r.modeOfAction }}</span>
                      <span class="link-result-pest">{{ r.targetPest }}</span>
                    </div>
                  </div>
                  <p v-else-if="histLinkQuery.trim().length > 1" class="muted" style="font-size:0.82rem; padding:0.4rem 0.65rem;">
                    검색 결과 없음 — OpenAPI 농약정보를 먼저 가져와야 합니다.
                  </p>
                </div>
                <div :id="`hist-form-slot-${t.id}`" class="mobile-form-slot"></div>
              </li>
            </template>
          </ul>
        </article>

        <!-- 폼 -->
        <Teleport v-if="showHistoryForm" :to="histFormTarget" :disabled="!isMobile">
        <article v-if="showHistoryForm" class="card">
          <h2>{{ editingId ? '이력 편집' : '새 기록' }}</h2>
          <form class="stack-form" @submit.prevent="submitTreatment">
            <label>날짜
              <input type="date" v-model="fDate" required />
            </label>
            <label>농약
              <input
                v-model="fBrand"
                placeholder="상표명 입력 (OpenAPI 검색)"
                autocomplete="off"
                @input="onFormBrandInput($event.target.value)"
              />
            </label>
            <div v-if="formLinkResults.length" class="inv-api-panel">
              <div
                v-for="r in formLinkResults"
                :key="`${r.pestiCode}-${r.diseaseUseSeq}`"
                class="inv-api-item"
                @mousedown.prevent="applyFormLink(r)"
              >
                <span class="inv-api-brand">{{ r.brandName }}</span>
                <span v-if="r.pesticideType" class="cat-badge" :class="categoryClass(normCat(r.pesticideType))">{{ normCat(r.pesticideType) }}</span>
                <span v-if="r.modeOfAction && r.modeOfAction !== '-'" class="moa-badge" :style="{ background: moaColor(r.modeOfAction) }">{{ r.modeOfAction }}</span>
                <span class="inv-api-pest">{{ r.targetPest }}</span>
              </div>
            </div>
            <div v-if="fMoa" class="hist-form-info">
              <span class="moa-badge" :style="{ background: moaColor(fMoa) }">{{ fMoa }}</span>
              <span class="cat-badge" :class="categoryClass(fCategory)">{{ fCategory }}</span>
            </div>
            <label>방제 대상
              <input v-model="fPest" list="pest-list" placeholder="예: 귤굴나방" autocomplete="off" />
              <datalist id="pest-list">
                <option v-for="p in recPests" :key="p" :value="p" />
              </datalist>
            </label>
            <label>메모
              <input v-model="fMemo" placeholder="희석배수, 날씨, 구역 등 (선택)" />
            </label>
            <p v-if="formError" class="form-error">{{ formError }}</p>
            <div class="row-actions">
              <button type="submit" :disabled="saving">
                {{ saving ? '저장 중...' : (editingId ? '저장' : '기록 추가') }}
              </button>
              <button v-if="editingId" class="ghost" type="button" @click="newHistoryEntry">새 기록</button>
            </div>
          </form>
        </article>
        </Teleport>

      </div>
    </section>

    <!-- ═══ 농약재고 ════════════════════════════════════════════════════════ -->
    <section v-if="activeTab === 'peststock'">
      <PesticideInventoryPanel />
    </section>

    <!-- ═══ 농약 추천 ═══════════════════════════════════════════════════════ -->
    <section v-if="activeTab === 'recommend'">
      <div class="rec-search">
        <input
          v-model="recPest"
          list="rec-pest-list"
          placeholder="방제 대상 입력 (예: 귤굴나방, 잿빛곰팡이병)"
          @keyup.enter="runRecommend"
          autocomplete="off"
        />
        <datalist id="rec-pest-list">
          <option v-for="p in recPests" :key="p" :value="p" />
        </datalist>
        <label class="rec-date-label">방제 예정일
          <input type="date" v-model="recDate" class="rec-date-input" @change="runRecommend" />
        </label>
        <button class="primary-btn" @click="runRecommend">추천 조회</button>
      </div>

      <div v-if="apStore.availableList.length === 0" class="empty-msg">
        가용농약 목록이 없습니다.<br>
        <span class="hint">'가용농약' 탭에서 구입가능농약을 입력하고 목록을 작성해주세요.</span>
      </div>
      <div v-else-if="!recResult" class="empty-msg">
        방제 대상을 입력하고 추천 조회를 눌러주세요.<br>
        <span class="hint">설정의 제약사항이 반영됩니다 ({{ settingsStore.settings.moaConflictDays }}일 이내 작용기작 중복 제외, 방제 예정일 기준).</span>
      </div>

      <template v-else>
        <div v-if="recResult.totalMatched === 0" class="empty-msg">
          '{{ recPest }}'에 등록된 농약이 없습니다. 다른 이름으로 검색해 보세요.
        </div>
        <template v-else>
          <!-- 추천 가능 -->
          <div class="rec-section">
            <h3 class="rec-section-title ok">
              추천 가능
              <span class="rec-count">{{ recResult.recommended.length }}건</span>
            </h3>
            <div v-if="recResult.recommended.length === 0" class="empty-msg small">
              현재 제약사항을 모두 만족하는 농약이 없습니다.
            </div>
            <div v-else class="rec-list">
              <div v-for="p in sortedRecommended" :key="p.brandName" class="rec-card rec-ok">
                <div class="rec-top">
                  <span class="rec-brand">{{ p.brandName }}</span>
                  <span class="moa-badge" :style="{ background: moaColor(p.moa) }">{{ p.moa }}</span>
                  <span class="cat-badge" :class="categoryClass(p.category)">{{ p.category }}</span>
                </div>
                <div class="rec-pests">{{ p.targetPests.join(', ') }}</div>
                <div v-if="p.useCount > 0" class="rec-usecount">올해 {{ p.useCount }}회 사용</div>
                <div v-if="inventoryStockMap[p.brandName]?.length" class="ap-stock-row">
                  재고
                  <span v-for="lot in inventoryStockMap[p.brandName]" :key="`${lot.vol}-${lot.expiry}`" class="ap-stock-lot">{{ stockLotLabel(lot) }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 제약으로 제외 -->
          <div v-if="recResult.excluded.length > 0" class="rec-section">
            <h3 class="rec-section-title ng">
              제약으로 제외
              <span class="rec-count">{{ recResult.excluded.length }}건</span>
            </h3>
            <div class="rec-list">
              <div v-for="p in sortedExcluded" :key="p.brandName" class="rec-card rec-ng">
                <div class="rec-top">
                  <span class="rec-brand">{{ p.brandName }}</span>
                  <span class="moa-badge moa-faded" :style="{ background: moaColor(p.moa) }">{{ p.moa }}</span>
                  <span class="cat-badge" :class="categoryClass(p.category)">{{ p.category }}</span>
                </div>
                <ul class="rec-reasons">
                  <li v-for="(r, i) in p.reasons" :key="i">{{ r }}</li>
                </ul>
                <div v-if="inventoryStockMap[p.brandName]?.length" class="ap-stock-row">
                  재고
                  <span v-for="lot in inventoryStockMap[p.brandName]" :key="`${lot.vol}-${lot.expiry}`" class="ap-stock-lot">{{ stockLotLabel(lot) }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </template>
    </section>

    <!-- ═══ 가용농약 ════════════════════════════════════════════════════════ -->
    <section v-if="activeTab === 'avail'">

      <!-- 구입가능농약 입력 -->
      <div class="form-card">
        <div class="form-card-header">
          <span class="form-card-title">구입가능농약 입력</span>
        </div>
        <p class="ap-hint">
          <code>상표명(형태)-용량</code> 형식, 줄바꿈으로 구분. 유사 농약은 <code>/</code>로 연결.<br>
          예) <code>만수무강(액상)-500ml</code> &nbsp;|&nbsp; <code>겔럭시(유)-200ml/올스타/오쏘도</code>
        </p>
        <textarea
          v-model="apInputText"
          class="ap-textarea"
          placeholder="여기에 붙여넣기..."
          rows="6"
        ></textarea>
        <div class="ap-input-footer">
          <span v-if="parsedCount > 0" class="ap-parse-count">{{ parsedCount }}개 항목 인식됨</span>
          <span v-else class="ap-parse-count muted">입력 없음</span>
        </div>
      </div>

      <!-- 재고농약 표시 -->
      <div class="ap-inv-row">
        <span class="ap-inv-label">재고농약</span>
        <span v-if="inventoryPesticides.length > 0" class="pill ap-inv-pill">{{ inventoryPesticides.length }}종</span>
        <span v-else class="muted" style="font-size:0.8rem;">없음 (재고 메뉴에서 농약 카테고리 항목 추가)</span>
        <span v-if="inventoryPesticides.length > 0" class="ap-inv-names">
          {{ inventoryPesticides.map(i => i.name).slice(0, 5).join(' · ') }}{{ inventoryPesticides.length > 5 ? ' 외 ' + (inventoryPesticides.length - 5) + '종' : '' }}
        </span>
      </div>

      <!-- 목록 작성 버튼 -->
      <div class="ap-build-row">
        <button class="primary-btn" :disabled="apBuilding" @click="buildApList">
          {{ apBuilding ? '작성 중...' : '목록 작성' }}
        </button>
        <span v-if="apStats.total > 0" class="ap-stats">
          {{ apStats.total }}개 &nbsp;·&nbsp; 연결 {{ apStats.matched }} &nbsp;·&nbsp; 미연결 {{ apStats.unmatched }}
        </span>
      </div>

      <!-- 가용농약 목록 -->
      <template v-if="apStore.availableList.length > 0">
        <div class="ap-list-header">
          <span class="ap-list-title">가용농약 목록</span>
          <div class="ap-src-filter">
            <button class="ap-src-btn" :class="{ active: apSourceFilter === 'all' }"       @click="apSourceFilter = 'all'">전체 ({{ apStats.total }})</button>
            <button class="ap-src-btn" :class="{ active: apSourceFilter === 'purchase' }"  @click="apSourceFilter = 'purchase'">구입가능 ({{ apSourceCounts.purchase }})</button>
            <button class="ap-src-btn" :class="{ active: apSourceFilter === 'inventory' }" @click="apSourceFilter = 'inventory'">재고 ({{ apSourceCounts.inventory }})</button>
          </div>
          <button
            class="ghost ap-unmatched-btn"
            :class="{ 'ap-unmatched-active': apUnmatchedOnly }"
            @click="apUnmatchedOnly = !apUnmatchedOnly"
          >미연결만 ({{ apStats.unmatched }})</button>
          <input
            v-model="apFilter"
            type="text"
            class="ap-filter-input"
            placeholder="필터 (농약명, 분류, 작용기작, 병해충)"
          />
        </div>

        <div class="ap-list">
          <div v-for="item in filteredApList" :key="item.id" class="ap-card">
            <!-- 카드 메인 -->
            <div class="ap-card-body">
              <div class="ap-card-name-row">
                <span class="ap-brand">{{ item.brandName }}</span>
                <span v-if="item.form"   class="ap-form">({{ item.form }})</span>
                <span v-if="item.volume" class="ap-vol">{{ item.volume }}</span>
              </div>
              <div class="ap-card-badges">
                <span class="source-badge" :class="item.source === 'purchase' ? 'src-purchase' : 'src-inv'">
                  {{ item.source === 'purchase' ? '구입가능' : '재고' }}
                </span>
                <span v-if="item.category" class="cat-badge" :class="categoryClassFor(item.category)">
                  {{ normCat(item.category) }}
                </span>
                <span v-if="item.moa" class="moa-badge" :style="{ background: moaColor(item.moa) }">
                  {{ item.moa }}
                </span>
                <span class="match-badge" :class="item.matchSource ? 'match-ok' : 'match-none'">
                  {{ matchLabel(item.matchSource) }}
                </span>
              </div>
              <div v-if="item.targetPests.length" class="ap-pests">
                {{ item.targetPests.join(' · ') }}
              </div>
              <div v-if="item.preHarvestDays" class="ap-safety">
                수확 {{ item.preHarvestDays }}일 전까지 · {{ item.maxApplications }}회 이내
              </div>
              <div v-if="item.ingredient" class="ap-ingredient">{{ item.ingredient }}</div>
              <div v-if="inventoryStockMap[item.brandName]?.length" class="ap-stock-row">
                재고
                <span
                  v-for="lot in inventoryStockMap[item.brandName]"
                  :key="`${lot.vol}-${lot.expiry}`"
                  class="ap-stock-lot"
                >{{ stockLotLabel(lot) }}</span>
              </div>
            </div>

            <!-- 카드 액션 -->
            <div class="ap-card-actions">
              <button
                class="action-btn"
                :class="{ 'action-btn-active': matchingItemId === item.id }"
                @click="openManualMatch(item.id)"
              >{{ item.matchSource === 'manual' ? '연결 변경' : (item.matchSource ? '수동 재연결' : '수동 연결') }}</button>
              <button
                v-if="item.matchSource === 'manual'"
                class="cancel-btn"
                @click="apStore.clearManualMatch(item.id)"
              >연결 해제</button>
              <button class="del-btn" @click="apStore.removeFromList(item.id)">삭제</button>
            </div>

            <!-- 수동 연결 패널 -->
            <div v-if="matchingItemId === item.id" class="match-panel">
              <input
                type="text"
                v-model="matchQuery"
                placeholder="농약명 검색 (OpenAPI 데이터)"
                class="match-search-input"
                @input="searchApiCandidates(matchQuery)"
              />
              <div v-if="matchResults.length" class="match-results">
                <div
                  v-for="r in matchResults"
                  :key="`${r.pestiCode}-${r.diseaseUseSeq}`"
                  class="match-result-item"
                  @click="applyMatch(item.id, r)"
                >
                  <span class="match-result-brand">{{ r.brandName }}</span>
                  <span class="cat-badge" :class="categoryClassFor(r.pesticideType)">{{ normCat(r.pesticideType) }}</span>
                  <span class="moa-badge" :style="{ background: moaColor(r.modeOfAction) }">{{ r.modeOfAction }}</span>
                  <span class="match-result-pest">{{ r.targetPest }}</span>
                </div>
              </div>
              <p v-else-if="matchQuery.trim().length > 1" class="muted" style="font-size:0.82rem; padding:0.5rem 0;">
                검색 결과 없음 — OpenAPI 데이터가 없거나 농약정보를 먼저 가져와야 합니다.
              </p>
            </div>
          </div>

          <p v-if="filteredApList.length === 0" class="empty-msg small">필터 결과 없음</p>
        </div>
      </template>
      <div v-else class="empty-msg">
        구입가능농약을 입력하거나 재고를 추가한 후 '목록 작성'을 눌러주세요.
      </div>

    </section>

    <!-- ═══ 추천 설정 ═══════════════════════════════════════════════════════ -->
    <section v-if="activeTab === 'settings'">
      <div class="settings-card">
        <div class="setting-row">
          <div class="setting-label">
            <span>작용기작 중복 제한 기간</span>
            <span class="setting-hint">같은 작용기작을 이 기간 내 재사용 시 제외</span>
          </div>
          <div class="setting-control days-control">
            <button class="ghost days-btn" @click="settingsStore.settings.moaConflictDays = Math.max(14, settingsStore.settings.moaConflictDays - 7)">−</button>
            <span class="days-value">{{ settingsStore.settings.moaConflictDays }}일</span>
            <button class="ghost days-btn" @click="settingsStore.settings.moaConflictDays = Math.min(180, settingsStore.settings.moaConflictDays + 7)">+</button>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-label">
            <span>연간 최대 사용 횟수 제한</span>
            <span class="setting-hint">동일 농약이 설정 횟수 이상 사용된 경우 제외</span>
          </div>
          <label class="toggle" aria-label="연간 최대 사용 횟수 제한">
            <input type="checkbox" v-model="settingsStore.settings.enforceMaxApplications" />
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div v-if="settingsStore.settings.enforceMaxApplications" class="setting-row setting-sub">
          <div class="setting-label">
            <span>최대 허용 횟수</span>
          </div>
          <div class="setting-control days-control">
            <button class="ghost days-btn" @click="settingsStore.settings.maxApplicationsPerYear = Math.max(1, settingsStore.settings.maxApplicationsPerYear - 1)">−</button>
            <span class="days-value">{{ settingsStore.settings.maxApplicationsPerYear }}회/년</span>
            <button class="ghost days-btn" @click="settingsStore.settings.maxApplicationsPerYear = Math.min(10, settingsStore.settings.maxApplicationsPerYear + 1)">+</button>
          </div>
        </div>

        <div class="setting-reset">
          <button class="ghost" @click="settingsStore.reset()">기본값으로 초기화</button>
        </div>
      </div>

      <div class="settings-note">
        <p>수확 전 안전기간 · 독성 등급 필터는 농약정보서비스 API 데이터 연동 시 추가 지원 예정입니다.</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.view-header { margin-bottom: 1.25rem; }
.subtitle { margin: 0.2rem 0 0; font-size: 0.8rem; color: var(--muted); }

/* ── Tabs ── */
.tab-bar {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1.25rem;
  border-bottom: 1px solid var(--line);
  padding-bottom: 0;
}
.tab-btn {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
  color: var(--muted);
  cursor: pointer;
  margin-bottom: -1px;
  border-radius: 0;
}
.tab-btn.active { color: var(--primary); border-bottom-color: var(--primary); font-weight: 600; }
.tab-btn:hover:not(.active) { color: var(--text); }

/* ── History 2-column layout ── */
.pip-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem; }
.pip-summary { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }
.pip-actions { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }

/* ── Form ── */
.hist-form-info { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; padding: 0.15rem 0; }
.form-error { font-size: 0.82rem; color: var(--danger, #dc2626); }
.primary-btn {
  align-self: flex-end;
  padding: 0.45rem 1.2rem;
  background: var(--primary);
  color: var(--primary-ink);
  border: none;
  border-radius: 0.5rem;
  font-size: 0.88rem;
  cursor: pointer;
  font-weight: 600;
}
.primary-btn:disabled { opacity: 0.5; cursor: not-allowed; }


/* ── 농약정보 연결 ── */
.link-btn-active { background: var(--primary) !important; color: var(--primary-ink) !important; border-color: var(--primary) !important; }
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
  padding: 0.5rem 0.75rem;
  font-size: 0.88rem;
  background: color-mix(in srgb, var(--primary) 4%, var(--surface));
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

/* OpenAPI 검색 패널 (폼 농약 입력란) */
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

/* ── MOA / category badges ── */
.moa-badge {
  display: inline-block;
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  letter-spacing: 0.02em;
  white-space: nowrap;
}
.moa-faded { opacity: 0.55; }
.cat-badge {
  font-size: 0.68rem;
  padding: 0.12rem 0.45rem;
  border-radius: 999px;
  font-weight: 600;
  border: 1px solid;
}
.cat-fungicide  { background: #f0fdf4; color: #166534; border-color: #bbf7d0; }
.cat-insecticide { background: #fff7ed; color: #9a3412; border-color: #fed7aa; }
.cat-miticide   { background: #eff6ff; color: #1e40af; border-color: #bfdbfe; }

/* ── Recommend ── */
.rec-search { display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap; align-items: flex-end; }
.rec-search > input { flex: 1; min-width: 180px; }
.rec-date-label { font-size: 0.78rem; color: var(--muted); display: flex; flex-direction: column; gap: 0.2rem; }
.rec-date-input { flex: none; width: auto; }

.rec-section { margin-bottom: 1.25rem; }
.rec-section-title {
  font-size: 0.9rem;
  font-weight: 700;
  margin: 0 0 0.6rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.rec-section-title.ok { color: #166534; }
.rec-section-title.ng { color: #9a3412; }
.rec-count { font-size: 0.78rem; font-weight: 400; color: var(--muted); }

.rec-list { display: flex; flex-direction: column; gap: 0.5rem; }
.rec-card {
  border: 1px solid var(--line);
  border-radius: 0.65rem;
  padding: 0.65rem 0.9rem;
}
.rec-ok { background: #f0fdf4; border-color: #bbf7d0; }
.rec-ng { background: #fef2f2; border-color: #fecaca; opacity: 0.85; }

.rec-top { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 0.3rem; }
.rec-brand { font-weight: 600; font-size: 0.88rem; }
.rec-pests { font-size: 0.78rem; color: var(--muted); }
.rec-usecount { font-size: 0.75rem; color: var(--muted); margin-top: 0.1rem; }
.rec-reasons { margin: 0.25rem 0 0; padding-left: 1.2rem; font-size: 0.8rem; color: #9a3412; }
.rec-reasons li { margin-bottom: 0.15rem; }

/* ── Settings ── */
.settings-card {
  background: var(--bg-soft);
  border: 1px solid var(--line);
  border-radius: 0.75rem;
  padding: 1rem 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--line);
}
.setting-row:last-child { border-bottom: none; }
.setting-sub { padding-left: 1.1rem; background: var(--surface); }
.setting-label { display: flex; flex-direction: column; gap: 0.15rem; }
.setting-label span:first-child { font-size: 0.88rem; font-weight: 500; }
.setting-hint { font-size: 0.75rem; color: var(--muted); }
.setting-control { flex-shrink: 0; }
.setting-reset { margin-top: 0.75rem; }

.days-control { display: flex; align-items: center; gap: 0.5rem; }
.days-btn { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; }
.days-value { font-size: 0.88rem; font-weight: 600; min-width: 52px; text-align: center; }

.toggle { position: relative; display: inline-block; width: 40px; height: 22px; cursor: pointer; }
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle-slider {
  position: absolute; inset: 0;
  background: var(--line); border-radius: 22px;
  transition: background 0.2s;
}
.toggle-slider::before {
  content: '';
  position: absolute;
  width: 16px; height: 16px;
  left: 3px; top: 3px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
}
.toggle input:checked + .toggle-slider { background: var(--primary); }
.toggle input:checked + .toggle-slider::before { transform: translateX(18px); }

.settings-note {
  margin-top: 0.75rem;
  font-size: 0.78rem;
  color: var(--muted);
  padding: 0.5rem 0.75rem;
  border-left: 2px solid var(--line);
}
.settings-note p { margin: 0; }

/* ── 가용농약 ── */
.ap-hint {
  font-size: 0.78rem;
  color: var(--muted);
  line-height: 1.6;
  margin: 0 0 0.5rem;
}
.ap-hint code {
  background: var(--surface-strong);
  border-radius: 3px;
  padding: 0.05rem 0.3rem;
  font-size: 0.76rem;
  color: var(--text);
}
.ap-textarea {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  font-size: 0.85rem;
  font-family: inherit;
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  padding: 0.6rem 0.75rem;
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
}
.ap-textarea:focus { outline: none; border-color: var(--primary); }
.ap-input-footer { display: flex; justify-content: flex-end; margin-top: 0.3rem; }
.ap-parse-count { font-size: 0.78rem; color: var(--muted); }

.ap-inv-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0.6rem 0;
  font-size: 0.83rem;
}
.ap-inv-label { font-weight: 600; font-size: 0.82rem; color: var(--muted); }
.ap-inv-pill { font-size: 0.75rem; }
.ap-inv-names { font-size: 0.78rem; color: var(--muted); }

.ap-build-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.1rem;
  flex-wrap: wrap;
}
.ap-stats { font-size: 0.8rem; color: var(--muted); }

.ap-list-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.6rem;
  flex-wrap: wrap;
}
.ap-list-title { font-size: 0.9rem; font-weight: 700; }
.ap-unmatched-btn {
  font-size: 0.78rem;
  border-radius: 999px;
  padding: 0.22rem 0.7rem;
  white-space: nowrap;
  flex-shrink: 0;
}
.ap-unmatched-active {
  background: #fef2f2;
  color: #b91c1c;
  border-color: #fca5a5;
}
.ap-src-filter {
  display: flex;
  border: 1px solid var(--line);
  border-radius: 0.4rem;
  overflow: hidden;
  flex-shrink: 0;
}
.ap-src-btn {
  background: none;
  border: none;
  border-right: 1px solid var(--line);
  padding: 0.22rem 0.6rem;
  font-size: 0.75rem;
  cursor: pointer;
  color: var(--muted);
  white-space: nowrap;
  font-family: inherit;
}
.ap-src-btn:last-child { border-right: none; }
.ap-src-btn.active { background: var(--primary); color: var(--primary-ink); font-weight: 600; }
.ap-src-btn:not(.active):hover { background: var(--surface-strong); color: var(--text); }

.ap-filter-input {
  flex: 1;
  min-width: 160px;
  font-size: 0.83rem;
  padding: 0.3rem 0.6rem;
  border: 1px solid var(--line);
  border-radius: 0.45rem;
  background: var(--bg);
  color: var(--text);
}

.ap-list { display: flex; flex-direction: column; gap: 0.55rem; }

.ap-card {
  background: var(--bg-soft);
  border: 1px solid var(--line);
  border-radius: 0.75rem;
  padding: 0.7rem 0.9rem;
}
.ap-card-body { margin-bottom: 0.45rem; }
.ap-card-name-row {
  display: flex;
  align-items: baseline;
  gap: 0.3rem;
  flex-wrap: wrap;
  margin-bottom: 0.3rem;
}
.ap-brand { font-weight: 600; font-size: 0.9rem; }
.ap-form  { font-size: 0.78rem; color: var(--muted); }
.ap-vol   { font-size: 0.78rem; color: var(--muted); }
.ap-card-badges {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex-wrap: wrap;
  margin-bottom: 0.25rem;
}
.ap-pests     { font-size: 0.78rem; color: var(--muted); margin-bottom: 0.15rem; }
.ap-safety    { font-size: 0.78rem; color: var(--muted); }
.ap-ingredient { font-size: 0.75rem; color: var(--muted); margin-top: 0.1rem; font-style: italic; }
.ap-stock-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.2rem;
  font-size: 0.75rem;
  color: var(--muted);
  flex-wrap: wrap;
}
.ap-stock-lot {
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #bbf7d0;
  border-radius: 999px;
  padding: 0.08rem 0.5rem;
  font-size: 0.72rem;
  font-weight: 600;
}

.ap-card-actions {
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
}

.source-badge {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  border: 1px solid;
}
.src-purchase { background: #f0fdf4; color: #15803d; border-color: #86efac; }
.src-inv      { background: #eff6ff; color: #1d4ed8; border-color: #93c5fd; }

.match-badge {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  border: 1px solid;
}
.match-ok   { background: #fefce8; color: #854d0e; border-color: #fde68a; }
.match-none { background: #f9fafb; color: var(--muted); border-color: var(--line); }

.match-panel {
  margin-top: 0.6rem;
  padding-top: 0.6rem;
  border-top: 1px dashed var(--line);
}
.match-search-input {
  width: 100%;
  box-sizing: border-box;
  font-size: 0.85rem;
  padding: 0.4rem 0.65rem;
  border: 1px solid var(--primary);
  border-radius: 0.45rem;
  background: var(--bg);
  color: var(--text);
  margin-bottom: 0.4rem;
}
.match-search-input:focus { outline: none; }
.match-results {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 240px;
  overflow-y: auto;
}
.match-result-item {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
  padding: 0.35rem 0.5rem;
  border-radius: 0.4rem;
  cursor: pointer;
  font-size: 0.82rem;
  background: var(--bg);
  border: 1px solid var(--line);
}
.match-result-item:hover { background: var(--surface-strong); border-color: var(--primary); }
.match-result-brand { font-weight: 600; }
.match-result-pest  { font-size: 0.76rem; color: var(--muted); margin-left: auto; }

/* ── Shared ── */
.empty-msg { color: var(--muted); font-size: 0.875rem; text-align: center; padding: 2rem; line-height: 1.6; }
.empty-msg.small { padding: 0.75rem; text-align: left; }
.hint { font-size: 0.8rem; }
</style>

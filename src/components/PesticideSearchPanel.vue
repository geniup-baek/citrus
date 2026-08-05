<script setup>
import { ref, computed, onMounted } from 'vue'
import { useLocaleStore } from '../stores/localeStore'
import { useRecommendSettingsStore } from '../stores/recommendSettingsStore'
import { useFarmsStore } from '../stores/farmsStore.js'
import { useAppPolicyStore } from '../stores/appPolicyStore.js'
import { getPesticideDetail, modeOfActionColor, warmFullCache, warmAllDetails, searchFromFullCache, searchGroupedFromFullCache, splitTargetPests, getTypesFromCache, getDetailCoverage, allPesticideRecords, formatPreHarvest, formatMaxApplications, saveManualPesticide, deleteManualPesticide, loadManualEntries, blankManualUsage, getDetailSummaryFromCache, DETAIL_INDEX_KEY, TOXIC_GRADES, FISH_TOXIC_GRADES } from '../services/pesticide'
import { confirm } from '../composables/useConfirm'
import { withCache, formatFetchedAt, pullSharedCache } from '../services/cache.js'

const localeStore = useLocaleStore()
const settingsStore = useRecommendSettingsStore()
const farmsStore = useFarmsStore()
const policyStore = useAppPolicyStore()
const t = (k) => localeStore.t(k)

const pestNameInput = ref('')
const targetPestInput = ref('')
const typeFilter = ref('all')

const items = ref([])
const total = ref(0)
// 같은 상표명의 레코드(병해충별로 나뉨)를 한 건으로 묶어서 볼지 여부
const groupMode = ref(true)
const page = ref(1)
const PAGE_SIZE = 20
const loading = ref(false)
const error = ref('')

const nameMode = ref('brand')

const availableTypes = ref([])
const cacheInfo = ref(null) // { error, fetchedAt } | null
// 전체 상표 수와 그중 상세정보를 가져온 상표 수
const detailCoverage = ref({ brands: 0, withDetail: 0 })
const manualCount = ref(0) // 직접등록 농약 수
const manualOnly = ref(false)
const groupedTotal = ref(0)   // 필터 없이 상표명으로 묶었을 때의 전체 종수
const ungroupedTotal = ref(0) // 필터 없이 병해충별로 펼쳤을 때의 전체 건수

const isFiltered = computed(() =>
  typeFilter.value !== 'all' || manualOnly.value || !!pestNameInput.value.trim() || !!targetPestInput.value.trim(),
)
// 요약칩의 분모 — 현재 상표명묶기/병해충별 보기 모드에 맞는 전체 건수를 쓴다.
const grandTotal = computed(() => groupMode.value ? groupedTotal.value : ungroupedTotal.value)

function refreshStats() {
  detailCoverage.value = getDetailCoverage()
  manualCount.value = loadManualEntries().length
  groupedTotal.value = detailCoverage.value.brands + manualCount.value
  ungroupedTotal.value = allPesticideRecords().length
}

const expandedId = ref(null)
const detailMap = ref({})
const detailLoading = ref(false)

const isMock = !import.meta.env.VITE_AGRI_API_KEY

function loadFromCache() {
  error.value = ''
  const params = {
    pestName: pestNameInput.value.trim(),
    targetPest: targetPestInput.value.trim(),
    pesticideType: typeFilter.value === 'all' ? '' : typeFilter.value,
    manualOnly: manualOnly.value,
    page: page.value,
    pageSize: PAGE_SIZE,
    sortBy: nameMode.value === 'brand' ? 'brandName' : 'name',
  }
  const local = groupMode.value ? searchGroupedFromFullCache(params) : searchFromFullCache(params)
  if (local) {
    items.value = local.list
    total.value = local.total
    cacheInfo.value = { error: null, fetchedAt: local.fetchedAt }
  } else {
    items.value = []
    total.value = 0
    cacheInfo.value = null
  }
}

async function fetchLatest() {
  loading.value = true
  error.value = ''
  try {
    await warmFullCache(true)
    availableTypes.value = getTypesFromCache()
    loadFromCache()
    refreshStats()
  } catch (e) {
    error.value = e.message
    loadFromCache()
  } finally {
    loading.value = false
  }
}

const detailsWarming = ref(false)
const detailsProgress = ref(null) // { done, total } | null

async function fetchAllDetails() {
  detailsWarming.value = true
  detailsProgress.value = null
  try {
    const force = !settingsStore.settings.skipCachedPesticideDetails
    await warmAllDetails(force, (done, listTotal) => {
      detailsProgress.value = { done, total: listTotal }
    })
  } finally {
    detailsWarming.value = false
    detailsProgress.value = null
    refreshStats()
  }
}

function search() {
  page.value = 1
  expandedId.value = null
  loadFromCache()
}

function itemKey(item) {
  return `${item.pestiCode}-${item.diseaseUseSeq}`
}

// 묶어보기가 꺼져 있으면 레코드 한 건을 "레코드 1개짜리 그룹"으로 감싸, 카드 렌더링을 한 갈래로 유지한다.
function toGroup(item) {
  return {
    key: itemKey(item),
    brandName: item.brandName,
    name: item.name,
    pesticideType: item.pesticideType,
    ingredient: item.ingredient,
    manufacturer: item.manufacturer,
    modeOfActions: (item.modeOfAction && item.modeOfAction !== '-') ? [item.modeOfAction] : [],
    targetPests: splitTargetPests(item.targetPest),
    records: [item],
  }
}

const displayGroups = computed(() =>
  groupMode.value ? items.value : items.value.map(toGroup),
)

const totalPages = computed(() => Math.ceil(total.value / PAGE_SIZE))

// 카드 한 줄에 병해충을 다 늘어놓으면 길어지므로 앞의 몇 개만 보여준다.
function pestSummary(group) {
  const shown = group.targetPests.slice(0, 3).join(', ')
  const rest = group.targetPests.length - 3
  return rest > 0 ? `${shown} 외 ${rest}종` : shown
}

// 상세정보(독성 등)는 제품 단위라 대표 레코드 하나만 조회하면 된다.
async function toggleDetail(group) {
  if (expandedId.value === group.key) {
    expandedId.value = null
    return
  }
  expandedId.value = group.key
  if (detailMap.value[group.key] !== undefined) return
  const rep = group.records[0]
  if (!rep) return
  // 직접등록 농약은 상세 API가 없다 — 레코드에 적어둔 값을 그대로 상세로 쓴다.
  if (rep.isManual) {
    detailMap.value[group.key] = {
      ingredient: rep.ingredient, ingredientContent: '',
      toxicName: rep.toxicName, fishToxic: rep.fishToxic,
    }
    return
  }
  // 받아둔 상세나 공유 색인에 있으면 조회 없이 바로 보여준다.
  const summary = getDetailSummaryFromCache(rep.pestiCode, rep.diseaseUseSeq)
  if (summary) {
    detailMap.value[group.key] = summary
    return
  }
  detailLoading.value = true
  try {
    const { result } = await withCache(
      `pesticide:detail:${itemKey(rep)}`,
      () => getPesticideDetail({ pestiCode: rep.pestiCode, diseaseUseSeq: rep.diseaseUseSeq }),
    )
    detailMap.value[group.key] = result
    refreshStats() // 이 상표의 상세를 새로 받아왔을 수 있다
  } catch {
    detailMap.value[group.key] = null
  } finally {
    detailLoading.value = false
  }
}

function goPage(n) {
  page.value = n
  loadFromCache()
}

// ── 직접등록 (공공데이터에 없는 농약) ─────────────────────────────────────────
// 모든 농장이 함께 쓰는 자료라, 농장 모드에서 등록을 허용할지는 관리모드 설정으로 정한다.
const canManageManual = computed(() =>
  farmsStore.isAdminMode || policyStore.policy.allowManualPesticideForAll,
)

function blankManualForm() {
  return {
    id: '', brandName: '', name: '', pesticideType: '', modeOfAction: '',
    ingredient: '', manufacturer: '', toxicName: '', fishToxic: '',
    usages: [blankManualUsage()], // 병해충별 사용기준
  }
}
const manualForm = ref(blankManualForm())
const showManualForm = ref(false)
const manualError = ref('')
const manualSaving = ref(false)

function openManualAdd() {
  manualForm.value = blankManualForm()
  manualError.value = ''
  showManualForm.value = true
}

// 목록 카드는 펼쳐진 레코드라, 편집은 저장 원본(제품 + 사용기준 목록)을 다시 읽어서 한다.
function openManualEdit(record) {
  const entry = loadManualEntries().find(e => e.id === record.id)
  if (!entry) return
  manualForm.value = {
    ...blankManualForm(),
    ...entry,
    usages: entry.usages.length ? entry.usages.map(u => ({ ...u })) : [blankManualUsage()],
  }
  manualError.value = ''
  showManualForm.value = true
}

function addUsageRow() {
  manualForm.value.usages.push(blankManualUsage())
}

function removeUsageRow(index) {
  manualForm.value.usages.splice(index, 1)
  if (!manualForm.value.usages.length) manualForm.value.usages.push(blankManualUsage())
}

function closeManualForm() {
  showManualForm.value = false
  manualError.value = ''
}

async function submitManual() {
  if (!manualForm.value.brandName.trim()) {
    manualError.value = '상표명을 입력하세요.'
    return
  }
  manualSaving.value = true
  try {
    await saveManualPesticide(manualForm.value)
    showManualForm.value = false
    availableTypes.value = getTypesFromCache()
    loadFromCache()
    refreshStats()
  } finally {
    manualSaving.value = false
  }
}

async function removeManual(record) {
  const ok = await confirm({
    message: `직접등록한 '${record.brandName}'을(를) 삭제합니다.`,
  })
  if (!ok) return
  await deleteManualPesticide(record.id)
  if (expandedId.value) expandedId.value = null
  availableTypes.value = getTypesFromCache()
  loadFromCache()
  refreshStats()
}

// 묶인 카드 안에 직접등록 레코드가 있으면 그 레코드를 돌려준다(수정·삭제 대상).
function manualRecordOf(group) {
  return group.records.find(r => r.isManual) ?? null
}

onMounted(async () => {
  availableTypes.value = getTypesFromCache()
  loadFromCache()
  refreshStats()
  // 공유 독성 색인은 앱 시작 시에도 받아오지만, 그 사이에 이 탭을 열었을 수 있어 한 번 더 확인한다.
  await pullSharedCache(DETAIL_INDEX_KEY)
  refreshStats()
})
</script>

<template>
  <div class="search-bar">
    <input
      v-model="pestNameInput"
      type="text"
      :placeholder="t('pesticide.searchByName')"
      @keyup.enter="search"
    />
    <input
      v-model="targetPestInput"
      type="text"
      :placeholder="t('pesticide.searchByPest')"
      @keyup.enter="search"
    />
    <button @click="search">{{ t('pest.query') }}</button>
    <button v-if="canManageManual" class="ghost" type="button" @click="openManualAdd">직접 추가</button>
  </div>

  <!-- 공공데이터에 없는 농약 직접등록 -->
  <div v-if="showManualForm && canManageManual" class="manual-form sub-card">
    <h3 class="manual-form-title">{{ manualForm.id ? '직접등록 농약 수정' : '농약 직접 추가' }}</h3>
    <p class="muted text-sm">공공데이터(농약안전정보시스템)에 없는 농약을 등록합니다. 등록하면 방제이력·농약재고·가용농약의 농약정보 연결에서도 검색됩니다.</p>
    <div class="manual-grid">
      <label>상표명 *
        <input v-model="manualForm.brandName" type="text" placeholder="예: 겔럭시" />
      </label>
      <label>품목명
        <input v-model="manualForm.name" type="text" placeholder="예: 아세타미프리드 수화제" />
      </label>
      <label>용도
        <input v-model="manualForm.pesticideType" type="text" list="manual-type-list" placeholder="예: 살충" />
        <datalist id="manual-type-list">
          <option v-for="opt in availableTypes" :key="opt" :value="opt" />
        </datalist>
      </label>
      <label>작용기작
        <input v-model="manualForm.modeOfAction" type="text" placeholder="예: 4a" />
      </label>
      <label>주성분
        <input v-model="manualForm.ingredient" type="text" placeholder="예: 아세타미프리드 8%" />
      </label>
      <label>제조사
        <input v-model="manualForm.manufacturer" type="text" />
      </label>
      <label>독성 등급
        <select v-model="manualForm.toxicName">
          <option value="">선택 안 함</option>
          <option v-for="g in TOXIC_GRADES" :key="g" :value="g">{{ g }}</option>
        </select>
      </label>
      <label>어독성 등급
        <select v-model="manualForm.fishToxic">
          <option value="">선택 안 함</option>
          <option v-for="g in FISH_TOXIC_GRADES" :key="g" :value="g">{{ g }}</option>
        </select>
      </label>
    </div>

    <!-- 병해충별 사용기준: 같은 농약도 병해충마다 희석배수·안전사용기준이 다르다. -->
    <div class="usage-editor">
      <div class="usage-editor-head">
        <span>병해충별 사용기준</span>
        <button class="ghost compact-btn" type="button" @click="addUsageRow">+ 병해충 추가</button>
      </div>
      <div class="usage-scroll">
        <table class="usage-table usage-edit-table">
          <thead>
            <tr>
              <th>대상 병해충</th>
              <th>희석배수</th>
              <th>사용방법</th>
              <th>수확 전 일수</th>
              <th>최대 사용 횟수</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(usage, i) in manualForm.usages" :key="i">
              <td><input v-model="usage.targetPest" type="text" placeholder="예: 귤굴나방" /></td>
              <td><input v-model="usage.dilution" type="text" placeholder="예: 2000배" /></td>
              <td><input v-model="usage.applicationMethod" type="text" placeholder="예: 경엽처리" /></td>
              <td><input v-model="usage.preHarvestDays" type="text" placeholder="예: 14" /></td>
              <td><input v-model="usage.maxApplications" type="text" placeholder="예: 3" /></td>
              <td>
                <button
                  class="ghost compact-btn"
                  type="button"
                  :disabled="manualForm.usages.length === 1"
                  @click="removeUsageRow(i)"
                >{{ t('common.delete') }}</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="muted text-sm">한 줄도 채우지 않으면 사용기준 없이 농약 정보만 등록됩니다.</p>
    </div>

    <p v-if="manualError" class="error-msg">{{ manualError }}</p>
    <div class="row-actions">
      <button type="button" :disabled="manualSaving" @click="submitManual">{{ manualSaving ? '저장 중...' : '저장' }}</button>
      <button class="ghost" type="button" @click="closeManualForm">{{ t('common.cancel') }}</button>
    </div>
  </div>

  <div class="sort-filter-bar">
    <span v-if="total > 0" class="summary-chip">{{ isFiltered ? localeStore.t('common.filteredCount', { shown: total, total: grandTotal }) : localeStore.t('common.totalCount', { n: total }) }}</span>
    <span class="filter-sep">|</span>
    <div class="seg-filter">
      <button
        v-for="opt in ['all', ...availableTypes]"
        :key="opt"
        class="seg-btn"
        :class="{ active: typeFilter === opt }"
        @click="typeFilter = opt; search()"
      >
        {{ opt === 'all' ? t('pesticide.typeAll') : opt }}
      </button>
    </div>
    <button
      v-if="manualOnly || manualCount > 0"
      class="ghost type-btn"
      :class="{ 'type-btn-active': manualOnly }"
      type="button"
      @click="manualOnly = !manualOnly; search()"
    >직접등록만 ({{ manualCount }})</button>
    <span
      v-if="farmsStore.isAdminMode && detailCoverage.brands > 0"
      class="result-count coverage-count"
      title="상세정보(독성 등)를 가져온 상표 수 / 전체 상표 수"
    >상세 {{ detailCoverage.withDetail }}/{{ detailCoverage.brands }}종</span>
    <span v-if="isMock" class="mock-badge">샘플 데이터</span>
    <div class="group-mode-toggle">
      <button
        class="ghost type-btn"
        :class="{ 'type-btn-active': groupMode }"
        @click="groupMode = true; search()"
      >상표명으로 묶기</button>
      <button
        class="ghost type-btn"
        :class="{ 'type-btn-active': !groupMode }"
        @click="groupMode = false; search()"
      >병해충별</button>
    </div>
    <div class="name-mode-toggle">
      <button
        class="ghost type-btn"
        :class="{ 'type-btn-active': nameMode === 'brand' }"
        @click="nameMode = 'brand'; search()"
      >상표명</button>
      <button
        class="ghost type-btn"
        :class="{ 'type-btn-active': nameMode === 'product' }"
        @click="nameMode = 'product'; search()"
      >품목명</button>
    </div>
  </div>

  <p v-if="error" class="error-msg">{{ t('pest.apiError') }} {{ error }}</p>
  <div v-if="cacheInfo" class="cache-banner" :class="{ 'cache-warn': cacheInfo.error }">
    <span class="cache-banner-icon">{{ cacheInfo.error ? '⚠' : 'ℹ' }}</span>
    <span v-if="cacheInfo.error" class="cache-banner-msg">API 오류 · </span>
    <span class="cache-banner-time">{{ formatFetchedAt(cacheInfo.fetchedAt) }} 기준 데이터</span>
    <div v-if="farmsStore.isAdminMode" class="cache-banner-actions">
      <button class="cache-refresh-btn" :disabled="loading" @click="fetchLatest">
        {{ loading ? '가져오는 중...' : '최신 정보 가져오기' }}
      </button>
      <button class="cache-refresh-btn" :disabled="isMock || detailsWarming" @click="fetchAllDetails">
        {{ detailsWarming
          ? `상세정보 가져오는 중... (${detailsProgress?.done ?? 0}/${detailsProgress?.total ?? 0})`
          : `상세정보 전체 가져오기 (${settingsStore.settings.skipCachedPesticideDetails ? '이미 있는 항목 건너뛰기' : '전체 새로 가져오기'})` }}
      </button>
    </div>
  </div>
  <div v-if="!loading && !error && !cacheInfo && displayGroups.length === 0" class="no-cache-state">
    <p>저장된 데이터가 없습니다.</p>
    <button v-if="farmsStore.isAdminMode" :disabled="loading" @click="fetchLatest">최신 정보 가져오기</button>
  </div>
  <p v-else-if="!loading && !error && cacheInfo && displayGroups.length === 0" class="empty-msg">{{ t('pest.noResults') }}</p>

  <div v-if="displayGroups.length > 0" class="pest-list">
    <div
      v-for="group in displayGroups"
      :key="group.key"
      class="pest-card"
    >
      <div class="pest-row" @click="toggleDetail(group)">
        <div class="pest-main">
          <span class="pest-name">{{ nameMode === 'brand' ? (group.brandName || group.name) : group.name }}</span>
          <span v-if="group.brandName && group.brandName !== group.name" class="brand-name">
            {{ nameMode === 'brand' ? group.name : group.brandName }}
          </span>
          <span class="type-tag" :class="group.pesticideType">{{ group.pesticideType }}</span>
          <span v-if="group.records.length > 1" class="rec-count">{{ group.records.length }}건</span>
          <span v-if="manualRecordOf(group)" class="manual-tag">직접등록</span>
        </div>
        <div class="pest-meta">
          <span>{{ group.ingredient }}</span>
          <span class="meta-sep">·</span>
          <span class="target-pest">{{ pestSummary(group) }}</span>
        </div>
        <div class="pest-right">
          <span
            v-for="moa in group.modeOfActions"
            :key="moa"
            class="moa-badge"
            :style="{ background: modeOfActionColor(moa) }"
            :title="t('pesticide.modeOfAction')"
          >{{ moa }}</span>
          <span
            v-if="group.modeOfActions.length === 0"
            class="moa-badge"
            :style="{ background: modeOfActionColor('-') }"
            :title="t('pesticide.modeOfAction')"
          >-</span>
          <span class="toggle-arrow">{{ expandedId === group.key ? '▲' : '▼' }}</span>
        </div>
      </div>

      <div v-if="expandedId === group.key" class="detail-panel">
        <div class="detail-grid">
          <div class="detail-row">
            <span class="dlabel">{{ t('pesticide.ingredient') }}</span>
            <span>
              {{ detailMap[group.key]?.ingredient || group.ingredient }}
              {{ detailMap[group.key]?.ingredientContent }}
            </span>
          </div>
          <div v-if="detailMap[group.key]?.toxicName" class="detail-row">
            <span class="dlabel">{{ t('pesticide.toxic') }}</span>
            <span>
              {{ detailMap[group.key].toxicName }}
              <span v-if="detailMap[group.key].fishToxic" class="item-meta"> · 어독성: {{ detailMap[group.key].fishToxic }}</span>
            </span>
          </div>
          <div v-if="group.manufacturer" class="detail-row">
            <span class="dlabel">{{ t('pesticide.manufacturer') }}</span>
            <span>{{ group.manufacturer }}</span>
          </div>
        </div>
        <p v-if="detailLoading && detailMap[group.key] === undefined" class="detail-no-cache">조회 중...</p>
        <p v-else-if="detailMap[group.key] === null" class="detail-no-cache">저장된 상세 데이터가 없습니다 (독성 정보 제외)</p>

        <div v-if="canManageManual && manualRecordOf(group)" class="row-actions manual-actions">
          <button class="ghost" type="button" @click="openManualEdit(manualRecordOf(group))">{{ t('common.edit') }}</button>
          <button class="danger" type="button" @click="removeManual(manualRecordOf(group))">{{ t('common.delete') }}</button>
        </div>

        <!-- 병해충별 사용기준: 같은 제품이라도 병해충마다 희석배수·안전사용기준이 다르다. -->
        <div class="usage-scroll">
          <table class="usage-table">
            <thead>
              <tr>
                <th>{{ t('pesticide.targetPest') }}</th>
                <th>{{ t('pesticide.dilution') }}</th>
                <th>{{ t('pesticide.applicationMethod') }}</th>
                <th>{{ t('pesticide.preHarvest') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="rec in group.records" :key="itemKey(rec)">
                <td class="usage-pest">{{ rec.targetPest }}</td>
                <td>{{ rec.dilution }}</td>
                <td>{{ rec.applicationMethod }}</td>
                <td>
                  {{ formatPreHarvest(rec.preHarvestDays) }}
                  <span v-if="rec.maxApplications" class="item-meta">/ {{ formatMaxApplications(rec.maxApplications) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <div v-if="totalPages > 1" class="pagination">
    <button class="ghost" :disabled="page === 1" @click="goPage(page - 1)">‹</button>
    <span>{{ page }} / {{ totalPages }}</span>
    <button class="ghost" :disabled="page === totalPages" @click="goPage(page + 1)">›</button>
  </div>
</template>

<style scoped>
.mock-badge {
  font-size: 0.7rem;
  background: var(--primary);
  color: var(--primary-ink);
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
}

.search-bar {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}
.search-bar input { flex: 1; min-width: 140px; }

.coverage-count { color: var(--muted); }

.manual-form { margin-bottom: 0.9rem; }
.manual-form-title { margin: 0 0 0.2rem; font-size: 1rem; }
.manual-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  gap: 0.5rem 0.75rem;
  margin: 0.7rem 0;
}
.manual-grid label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.8rem; color: var(--muted); }
.manual-actions { margin-top: 0.7rem; }

.usage-editor { margin-top: 0.3rem; }
.usage-editor-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: var(--muted);
  margin-bottom: 0.35rem;
}
.usage-edit-table th { white-space: nowrap; }
.usage-edit-table td { padding: 0.2rem 0.3rem 0.2rem 0; }
.usage-edit-table input { min-width: 7rem; font-size: 0.8rem; }

.manual-tag {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  border: 1px solid var(--tone-blue-border);
  background: var(--tone-blue-bg);
  color: var(--tone-blue-text);
}

.group-mode-toggle { display: flex; gap: 0.25rem; margin-left: auto; }
.name-mode-toggle { display: flex; gap: 0.25rem; margin-left: 0.5rem; }

.pest-list { display: flex; flex-direction: column; gap: 0.6rem; }

.pest-card {
  border: 1px solid var(--line);
  border-radius: 0.75rem;
  background: var(--bg-soft);
  overflow: hidden;
}

.pest-row {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas:
    "main right"
    "meta right";
  column-gap: 0.75rem;
  row-gap: 0.2rem;
  padding: 0.75rem 1rem;
  cursor: pointer;
  border-radius: 1rem;
}
.pest-row:hover { background: var(--surface-strong); border-radius: 1rem 1rem 0 0; }

.pest-main {
  grid-area: main;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.pest-name { font-weight: 600; font-size: 0.9rem; }
.brand-name { font-size: 0.75rem; color: var(--muted); }

.type-tag {
  font-size: 0.72rem;
  padding: 0.12rem 0.45rem;
  border-radius: 999px;
  font-weight: 600;
  border: 1px solid;
}
.type-tag.살균 { background: var(--tone-green-bg); color: var(--tone-green-text); border-color: var(--tone-green-border); }
.type-tag.살충 { background: var(--tone-orange-bg); color: var(--tone-orange-text); border-color: var(--tone-orange-border); }

.pest-meta {
  grid-area: meta;
  font-size: 0.8rem;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex-wrap: wrap;
}
.meta-sep { opacity: 0.35; }
.target-pest { color: var(--text); }

.pest-right {
  grid-area: right;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  align-self: center;
}
.toggle-arrow { font-size: 0.7rem; color: var(--muted); }

.detail-panel {
  border-top: 1px solid var(--line);
  padding: 0.9rem 1rem;
  background: var(--bg-soft);
}
.detail-grid { display: flex; flex-direction: column; gap: 0.45rem; }
.detail-row {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 0.5rem;
  font-size: 0.83rem;
}
.dlabel { color: var(--muted); }
.detail-no-cache { font-size: 0.82rem; color: var(--muted); padding: 0.25rem 0; }
.moa-detail { display: flex; align-items: center; gap: 0.5rem; }

.rec-count {
  font-size: 0.7rem;
  color: var(--muted);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.05rem 0.4rem;
}

.usage-scroll { overflow-x: auto; margin-top: 0.7rem; }
.usage-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
  white-space: nowrap;
}
.usage-table th,
.usage-table td {
  text-align: left;
  padding: 0.35rem 0.6rem 0.35rem 0;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
}
.usage-table th { color: var(--muted); font-weight: 500; }
.usage-table tr:last-child td { border-bottom: none; }
.usage-pest { white-space: normal; min-width: 8rem; }

</style>

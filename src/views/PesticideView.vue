<script setup>
import { ref, computed, onMounted } from 'vue'
import { useLocaleStore } from '../stores/localeStore'
import { getPesticideDetail, modeOfActionColor, warmFullCache, warmAllDetails, searchFromFullCache, getTypesFromCache, formatPreHarvest, formatMaxApplications } from '../services/pesticide'
import { withCache, formatFetchedAt } from '../services/cache.js'

const localeStore = useLocaleStore()
const t = (k) => localeStore.t(k)

const pestNameInput = ref('')
const targetPestInput = ref('')
const typeFilter = ref('all')

const items = ref([])
const total = ref(0)
const page = ref(1)
const PAGE_SIZE = 20
const loading = ref(false)
const error = ref('')

const nameMode = ref('brand')

const availableTypes = ref([])
const cacheInfo = ref(null) // { error, fetchedAt } | null

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
    page: page.value,
    pageSize: PAGE_SIZE,
  }
  const local = searchFromFullCache(params)
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
    await warmAllDetails(false, (done, listTotal) => {
      detailsProgress.value = { done, total: listTotal }
    })
  } finally {
    detailsWarming.value = false
    detailsProgress.value = null
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

async function toggleDetail(item) {
  const key = itemKey(item)
  if (expandedId.value === key) {
    expandedId.value = null
    return
  }
  expandedId.value = key
  if (detailMap.value[key]) return
  detailLoading.value = true
  try {
    const { result } = await withCache(
      `pesticide:detail:${key}`,
      () => getPesticideDetail({ pestiCode: item.pestiCode, diseaseUseSeq: item.diseaseUseSeq }),
    )
    detailMap.value[key] = result
  } catch {
    detailMap.value[key] = null
  } finally {
    detailLoading.value = false
  }
}

const filteredItems = computed(() => items.value)
const totalPages = computed(() => Math.ceil(total.value / PAGE_SIZE))

function goPage(n) {
  page.value = n
  loadFromCache()
}

onMounted(() => {
  availableTypes.value = getTypesFromCache()
  loadFromCache()
})
</script>

<template>
  <div class="card pesticide-view">
    <div class="view-header">
      <h2>{{ t('pesticide.title') }}</h2>
      <p class="subtitle">
        {{ t('pesticide.subtitle') }}
        <span v-if="isMock" class="mock-badge">샘플 데이터</span>
      </p>
    </div>

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
    </div>

    <div class="type-filter">
      <button
        v-for="opt in ['all', ...availableTypes]"
        :key="opt"
        class="ghost type-btn"
        :class="{ 'type-btn-active': typeFilter === opt }"
        @click="typeFilter = opt; search()"
      >
        {{ opt === 'all' ? t('pesticide.typeAll') : opt }}
      </button>
      <span v-if="total > 0" class="result-count">{{ t('pest.totalCount').replace('{count}', total) }}</span>
      <div class="name-mode-toggle">
        <button
          class="ghost type-btn"
          :class="{ 'type-btn-active': nameMode === 'brand' }"
          @click="nameMode = 'brand'"
        >상표명</button>
        <button
          class="ghost type-btn"
          :class="{ 'type-btn-active': nameMode === 'product' }"
          @click="nameMode = 'product'"
        >품목명</button>
      </div>
    </div>

    <p v-if="error" class="error-msg">{{ t('pest.apiError') }} {{ error }}</p>
    <div v-if="cacheInfo" class="cache-banner" :class="{ 'cache-warn': cacheInfo.error }">
      <span class="cache-banner-icon">{{ cacheInfo.error ? '⚠' : 'ℹ' }}</span>
      <span v-if="cacheInfo.error" class="cache-banner-msg">API 오류 · </span>
      <span class="cache-banner-time">{{ formatFetchedAt(cacheInfo.fetchedAt) }} 기준 데이터</span>
      <button class="cache-refresh-btn" :disabled="loading" @click="fetchLatest">
        {{ loading ? '가져오는 중...' : '최신 정보 가져오기' }}
      </button>
      <button class="cache-refresh-btn" :disabled="isMock || detailsWarming" @click="fetchAllDetails">
        {{ detailsWarming ? `상세정보 가져오는 중... (${detailsProgress?.done ?? 0}/${detailsProgress?.total ?? 0})` : '상세정보 전체 가져오기' }}
      </button>
    </div>
    <div v-if="!loading && !error && !cacheInfo && filteredItems.length === 0" class="no-cache-state">
      <p>저장된 데이터가 없습니다.</p>
      <button :disabled="loading" @click="fetchLatest">최신 정보 가져오기</button>
    </div>
    <p v-else-if="!loading && !error && cacheInfo && filteredItems.length === 0" class="empty-msg">{{ t('pest.noResults') }}</p>

    <div v-if="filteredItems.length > 0" class="pest-list">
      <div
        v-for="item in filteredItems"
        :key="itemKey(item)"
        class="pest-card"
      >
        <div class="pest-row" @click="toggleDetail(item)">
          <div class="pest-main">
            <span class="pest-name">{{ nameMode === 'brand' ? (item.brandName || item.name) : item.name }}</span>
            <span v-if="item.brandName && item.brandName !== item.name" class="brand-name">
              {{ nameMode === 'brand' ? item.name : item.brandName }}
            </span>
            <span class="type-tag" :class="item.pesticideType">{{ item.pesticideType }}</span>
          </div>
          <div class="pest-meta">
            <span>{{ item.ingredient }}</span>
            <span class="meta-sep">·</span>
            <span class="target-pest">{{ item.targetPest }}</span>
          </div>
          <div class="pest-right">
            <span
              class="moa-badge"
              :style="{ background: modeOfActionColor(item.modeOfAction) }"
              :title="t('pesticide.modeOfAction')"
            >{{ item.modeOfAction }}</span>
            <span class="toggle-arrow">{{ expandedId === itemKey(item) ? '▲' : '▼' }}</span>
          </div>
        </div>

        <div v-if="expandedId === itemKey(item)" class="detail-panel">
          <p v-if="detailLoading && !detailMap[itemKey(item)]" class="item-meta">조회 중...</p>
          <p v-else-if="detailMap[itemKey(item)] === null" class="detail-no-cache">저장된 상세 데이터가 없습니다</p>
          <template v-else-if="detailMap[itemKey(item)]">
            <div class="detail-grid">
              <div class="detail-row">
                <span class="dlabel">{{ t('pesticide.ingredient') }}</span>
                <span>{{ detailMap[itemKey(item)].ingredient }} {{ detailMap[itemKey(item)].ingredientContent }}</span>
              </div>
              <div class="detail-row">
                <span class="dlabel">{{ t('pesticide.targetPest') }}</span>
                <span>{{ item.targetPest }}</span>
              </div>
              <div class="detail-row">
                <span class="dlabel">{{ t('pesticide.dilution') }}</span>
                <span>{{ item.dilution }}</span>
              </div>
              <div class="detail-row">
                <span class="dlabel">{{ t('pesticide.applicationMethod') }}</span>
                <span>{{ item.applicationMethod }}</span>
              </div>
              <div class="detail-row">
                <span class="dlabel">{{ t('pesticide.preHarvest') }}</span>
                <span>{{ formatPreHarvest(item.preHarvestDays) }} / {{ formatMaxApplications(item.maxApplications) }}</span>
              </div>
              <div class="detail-row">
                <span class="dlabel">{{ t('pesticide.modeOfAction') }}</span>
                <span class="moa-detail">
                  <span class="moa-badge" :style="{ background: modeOfActionColor(item.modeOfAction) }">{{ item.modeOfAction }}</span>
                </span>
              </div>
              <div v-if="detailMap[itemKey(item)].toxicName" class="detail-row">
                <span class="dlabel">{{ t('pesticide.toxic') }}</span>
                <span>
                  {{ detailMap[itemKey(item)].toxicName }}
                  <span v-if="detailMap[itemKey(item)].fishToxic" class="item-meta"> · 어독성: {{ detailMap[itemKey(item)].fishToxic }}</span>
                </span>
              </div>
              <div v-if="item.manufacturer" class="detail-row">
                <span class="dlabel">{{ t('pesticide.manufacturer') }}</span>
                <span>{{ item.manufacturer }}</span>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <div v-if="totalPages > 1" class="pagination">
      <button class="ghost" :disabled="page === 1" @click="goPage(page - 1)">‹</button>
      <span>{{ page }} / {{ totalPages }}</span>
      <button class="ghost" :disabled="page === totalPages" @click="goPage(page + 1)">›</button>
    </div>
  </div>
</template>

<style scoped>

.view-header { margin-bottom: 1.25rem; }
.subtitle {
  margin: 0.2rem 0 0;
  font-size: 0.8rem;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
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

.type-filter {
  display: flex;
  gap: 0.4rem;
  align-items: center;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}
.type-btn {
  border-radius: 999px;
  font-size: 0.82rem;
  padding: 0.28rem 0.72rem;
}
.type-btn-active {
  background: var(--primary);
  color: var(--primary-ink);
  border-color: transparent;
}
.result-count { font-size: 0.8rem; color: var(--muted); }
.name-mode-toggle { display: flex; gap: 0.25rem; margin-left: auto; }

.error-msg { color: var(--danger); font-size: 0.875rem; }
.empty-msg { color: var(--muted); font-size: 0.875rem; text-align: center; padding: 2rem; }

.cache-banner {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
  background: #e8f4fd;
  border: 1px solid #90caf9;
  color: #0d47a1;
  border-radius: 0.65rem;
  padding: 0.6rem 0.85rem;
  margin-bottom: 0.75rem;
  font-size: 0.83rem;
}
.cache-banner.cache-warn {
  background: #fffbe6;
  border-color: #f5d76e;
  color: #7a5c00;
}
.cache-banner-icon { font-size: 0.9rem; }

.cache-banner-time { font-size: 0.78rem; opacity: 0.8; white-space: nowrap; }
.cache-refresh-btn {
  margin-left: auto;
  border: 1px solid currentColor;
  background: transparent;
  color: inherit;
  font-size: 0.78rem;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
}
.cache-refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.no-cache-state {
  text-align: center;
  padding: 2.5rem 1rem;
  color: var(--muted);
}
.no-cache-state p { margin: 0 0 0.75rem; font-size: 0.9rem; }
.no-cache-state button { font-size: 0.85rem; }

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
  font-size: 0.68rem;
  padding: 0.12rem 0.45rem;
  border-radius: 999px;
  font-weight: 600;
  border: 1px solid;
}
.type-tag.살균 { background: #f0fdf4; color: #166534; border-color: #bbf7d0; }
.type-tag.살충 { background: #fff7ed; color: #9a3412; border-color: #fed7aa; }

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

.moa-badge {
  display: inline-block;
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  letter-spacing: 0.02em;
}

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

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  margin-top: 1.5rem;
  font-size: 0.875rem;
}
.pagination button:disabled { opacity: 0.4; cursor: not-allowed; }
</style>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import {
  getDiseaseDetail,
  getPathogenDetail,
  getInsectDetail,
  getPrediction,
  normalizePrediction,
  getSurveillance,
  getSurveillanceDetailByGungu,
  normalizeList,
  warmFullPestCache,
  getFromFullPestCache,
  warmSurvDetails,
  getPredictionFromCache,
  getSurveillanceFromCache,
} from '../services/ncpms.js'
import { useLocaleStore } from '../stores/localeStore'
import { withCache, formatFetchedAt } from '../services/cache.js'

const localeStore = useLocaleStore()

const activeTab = ref('search')
const loading = ref(false)
const error = ref('')
const cacheInfo = ref(null) // { error, fetchedAt } | null

// ─── 병해충검색 ───────────────────────────────────────────────────
const searchMode = ref('disease')
const PAGE_SIZE = 10

const diseaseItems = ref([])
const diseaseTotal = ref(0)
const diseasePage = ref(1)
const diseaseLoaded = ref(false)

const pathogenItems = ref([])
const pathogenTotal = ref(0)
const pathogenPage = ref(1)
const pathogenLoaded = ref(false)

const insectItems = ref([])
const insectTotal = ref(0)
const insectPage = ref(1)
const insectLoaded = ref(false)

const searchExpandedId = ref(null)
const searchDetailData = ref(null)
const searchDetailLoading = ref(false)
const searchDetailError = ref('')

// ─── 병해충예측 ───────────────────────────────────────────────────
const predItems = ref([])

// ─── 병해충예찰 ───────────────────────────────────────────────────
const survYear = ref(String(new Date().getFullYear()))
const survItems = ref([])
const survExpandedKey = ref('')
const survDetailItems = ref([])
const survDetailLoading = ref(false)
const survDetailError = ref('')

const YEARS = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i))

async function run(fn) {
  loading.value = true
  error.value = ''
  cacheInfo.value = null
  try {
    await fn()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

// ─── 병해충검색 ───────────────────────────────────────────────────
function loadPestList({ type, page, setItems, setTotal, setLoaded, pageRef }) {
  pageRef.value = page
  searchExpandedId.value = null
  searchDetailData.value = null
  error.value = ''
  cacheInfo.value = null
  const local = getFromFullPestCache(type, page, PAGE_SIZE)
  if (local) {
    setItems(local.list)
    setTotal(local.total)
    setLoaded(true)
    cacheInfo.value = { error: null, fetchedAt: local.fetchedAt }
  } else {
    setItems([])
    setTotal(0)
    setLoaded(false)
  }
}

function loadDiseases(page = 1) {
  loadPestList({
    type: 'disease', page,
    setItems: v => { diseaseItems.value = v },
    setTotal: v => { diseaseTotal.value = v },
    setLoaded: v => { diseaseLoaded.value = v },
    pageRef: diseasePage,
  })
}

function loadPathogens(page = 1) {
  loadPestList({
    type: 'pathogen', page,
    setItems: v => { pathogenItems.value = v },
    setTotal: v => { pathogenTotal.value = v },
    setLoaded: v => { pathogenLoaded.value = v },
    pageRef: pathogenPage,
  })
}

function loadInsects(page = 1) {
  loadPestList({
    type: 'insect', page,
    setItems: v => { insectItems.value = v },
    setTotal: v => { insectTotal.value = v },
    setLoaded: v => { insectLoaded.value = v },
    pageRef: insectPage,
  })
}

// 서브탭 카운트는 현재 보고 있는 탭과 무관하게 항상 표시되어야 하므로,
// 세 종류의 전건 캐시에서 total만 따로 읽어 채운다.
function refreshCounts() {
  diseaseTotal.value  = getFromFullPestCache('disease', 1, PAGE_SIZE)?.total ?? 0
  pathogenTotal.value = getFromFullPestCache('pathogen', 1, PAGE_SIZE)?.total ?? 0
  insectTotal.value   = getFromFullPestCache('insect', 1, PAGE_SIZE)?.total ?? 0
}

function switchSearchMode(mode) {
  searchMode.value = mode
  error.value = ''
  searchExpandedId.value = null
  searchDetailData.value = null
  if (mode === 'disease') loadDiseases(diseasePage.value || 1)
  else if (mode === 'pathogen') loadPathogens(pathogenPage.value || 1)
  else if (mode === 'insect') loadInsects(insectPage.value || 1)
}

function loadSearchTab() {
  const m = searchMode.value
  if (m === 'disease') loadDiseases(diseasePage.value || 1)
  else if (m === 'pathogen') loadPathogens(pathogenPage.value || 1)
  else if (m === 'insect') loadInsects(insectPage.value || 1)
}

async function fetchLatestSearch() {
  loading.value = true
  error.value = ''
  cacheInfo.value = null
  try {
    await warmFullPestCache(true)
    diseaseLoaded.value = false
    pathogenLoaded.value = false
    insectLoaded.value = false
    refreshCounts()
    loadSearchTab()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

// ─── 병해충예측 ───────────────────────────────────────────────────
function loadCachedPrediction() {
  cacheInfo.value = null
  const cached = getPredictionFromCache()
  if (cached) {
    predItems.value = normalizePrediction(cached.result)
    cacheInfo.value = { error: null, fetchedAt: cached.fetchedAt }
  } else {
    predItems.value = []
  }
}

// ─── 병해충예찰 ───────────────────────────────────────────────────
function loadCachedSurveillance() {
  survExpandedKey.value = ''
  survDetailItems.value = []
  cacheInfo.value = null
  const cached = getSurveillanceFromCache(survYear.value)
  if (cached) {
    survItems.value = normalizeList(cached.result)
    cacheInfo.value = { error: null, fetchedAt: cached.fetchedAt }
  } else {
    survItems.value = []
  }
}

function switchTab(tab) {
  activeTab.value = tab
  error.value = ''
  cacheInfo.value = null
  if (tab === 'prediction') loadCachedPrediction()
  else if (tab === 'surveillance') loadCachedSurveillance()
  else loadSearchTab()
}

const currentFetchLatest = computed(() => {
  if (activeTab.value === 'prediction') return fetchPrediction
  if (activeTab.value === 'surveillance') return fetchSurveillance
  return fetchLatestSearch
})

async function toggleSearchDetail(id, type) {
  if (searchExpandedId.value === id) {
    searchExpandedId.value = null
    searchDetailData.value = null
    return
  }
  searchExpandedId.value = id
  searchDetailData.value = null
  searchDetailError.value = ''
  searchDetailLoading.value = true
  try {
    let fetchFn
    if (type === 'disease') fetchFn = () => getDiseaseDetail({ sickKey: id })
    else if (type === 'pathogen') fetchFn = () => getPathogenDetail({ virusKey: id })
    else fetchFn = () => getInsectDetail({ insectKey: id })
    const { result } = await withCache(`pest:detail:${type}:${id}`, fetchFn)
    searchDetailData.value = result?.service ?? null
  } catch (e) {
    searchDetailError.value = e.message
  } finally {
    searchDetailLoading.value = false
  }
}

function stripHtml(str) {
  if (!str) return ''
  return str
    .replaceAll('<br/>', '\n')
    .replaceAll('<br />', '\n')
    .replace(/<[^>]+>/g, '')
    .trim()
}

// ─── 병해충예측 ───────────────────────────────────────────────────
async function fetchPrediction() {
  await run(async () => {
    const { result, fromCache, fetchedAt, cacheError } = await withCache(
      'pest:prediction',
      () => getPrediction(),
    )
    predItems.value = normalizePrediction(result)
    cacheInfo.value = { error: fromCache ? cacheError : null, fetchedAt }
  })
}

function riskColor(riskIdx, stageCount) {
  if (riskIdx === 0 || stageCount === 0) return 'var(--muted)'
  const ratio = riskIdx / stageCount
  if (ratio >= 1) return '#e53935'
  if (ratio >= 0.5) return '#f08a24'
  return '#f5c518'
}

// ─── 병해충예찰 ───────────────────────────────────────────────────
async function fetchSurveillance() {
  survExpandedKey.value = ''
  survDetailItems.value = []
  survItems.value = []
  await run(async () => {
    const { result, fromCache, fetchedAt, cacheError } = await withCache(
      `pest:surveillance:${survYear.value}`,
      () => getSurveillance({ year: survYear.value }),
    )
    survItems.value = normalizeList(result)
    cacheInfo.value = { error: fromCache ? cacheError : null, fetchedAt }
  })
  if (!error.value && survItems.value.length > 0) {
    warmSurvDetails(survYear.value, survItems.value)
  }
}

async function toggleSurvDetail(item) {
  const key = item.insectKey
  if (survExpandedKey.value === key) {
    survExpandedKey.value = ''
    survDetailItems.value = []
    return
  }
  survExpandedKey.value = key
  survDetailItems.value = []
  survDetailError.value = ''
  survDetailLoading.value = true
  try {
    const { result } = await withCache(
      `pest:surv:detail:${survYear.value}:${key}`,
      () => getSurveillanceDetailByGungu({ insectKey: key }),
    )
    survDetailItems.value = normalizeList(result)
  } catch (e) {
    survDetailError.value = e.message
  } finally {
    survDetailLoading.value = false
  }
}

function totalPages(total) {
  return Math.max(1, Math.ceil(total / PAGE_SIZE))
}

// SVC53 결과를 시군구별로 묶음
function groupBySigungu(items) {
  const map = {}
  for (const item of items) {
    const city = item.sigunguNm ?? '기타'
    if (!map[city]) map[city] = []
    map[city].push(item)
  }
  return Object.entries(map).map(([city, list]) => ({ city, list }))
}

// NCPMS 이미지 URL이 http:// → 브라우저 혼합 콘텐츠 차단 대비 https로 변환
function imgUrl(url) {
  if (!url) return ''
  return url.replace(/^http:\/\/ncpms\.rda\.go\.kr/, 'https://ncpms.rda.go.kr')
}

watch(survYear, () => {
  if (activeTab.value === 'surveillance') loadCachedSurveillance()
})

onMounted(() => {
  refreshCounts()
  loadSearchTab()
})
</script>

<template>
  <section class="page-grid">
    <article class="card">
      <div class="row-actions align-start" style="margin-bottom: 0.25rem;">
        <div>
          <h2>{{ localeStore.t('pest.title') }}</h2>
          <p class="muted" style="font-size: 0.82rem; margin-top: 0.2rem;">
            {{ localeStore.t('pest.subtitle') }}
          </p>
        </div>
      </div>

      <!-- 주요 탭 -->
      <div class="task-panel-tabs">
        <div class="category-chip-row">
          <button
            v-for="tab in [
              { key: 'search', label: localeStore.t('pest.tabSearch') },
              { key: 'prediction', label: localeStore.t('pest.tabPrediction') },
              { key: 'surveillance', label: localeStore.t('pest.tabSurveillance') },
            ]"
            :key="tab.key"
            :class="['category-chip', { active: activeTab === tab.key }]"
            @click="switchTab(tab.key)"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>

      <!-- 오류 배너 -->
      <div v-if="error" class="pest-error">
        <strong>{{ localeStore.t('pest.apiError') }}</strong>
        <span style="white-space: pre-line;">{{ error }}</span>
      </div>

      <!-- 캐시 배너 -->
      <div v-if="cacheInfo" class="cache-banner" :class="{ 'cache-warn': cacheInfo.error }">
        <span class="cache-banner-icon">{{ cacheInfo.error ? '⚠' : 'ℹ' }}</span>
        <span v-if="cacheInfo.error" class="cache-banner-msg">API 오류 · </span>
        <span class="cache-banner-time">{{ formatFetchedAt(cacheInfo.fetchedAt) }} 기준 데이터</span>
        <button v-if="activeTab !== 'surveillance'" class="cache-refresh-btn" :disabled="loading" @click="currentFetchLatest()">
          {{ loading ? '가져오는 중...' : '최신 정보 가져오기' }}
        </button>
      </div>

      <!-- ═══════════ 병해충검색 ═══════════ -->
      <template v-if="activeTab === 'search'">
        <!-- 서브탭: 병 / 병원체 / 해충 -->
        <div class="sort-filter-bar" style="margin-bottom: 0.75rem;">
          <button
            v-for="m in [
              { key: 'disease', label: localeStore.t('pest.diseaseMode'), count: diseaseTotal },
              { key: 'pathogen', label: localeStore.t('pest.pathogenMode'), count: pathogenTotal },
              { key: 'insect', label: localeStore.t('pest.insectMode'), count: insectTotal },
            ]"
            :key="m.key"
            :class="['ghost', 'compact-btn', { 'pest-submode-active': searchMode === m.key }]"
            @click="switchSearchMode(m.key)"
          >
            {{ m.label }}
            <span v-if="m.count" class="pest-count">({{ m.count }})</span>
          </button>
        </div>

        <!-- 검색탭 캐시 없을 때 새로고침 유도 -->
        <div v-if="!loading && !cacheInfo && !error" class="no-cache-state">
          <p>저장된 데이터가 없습니다.</p>
          <button :disabled="loading" @click="fetchLatestSearch">최신 정보 가져오기</button>
        </div>

        <!-- 병 목록 (SVC01) + 상세 (SVC05) -->
        <template v-if="searchMode === 'disease'">
          <ul v-if="diseaseItems.length" class="list clean">
            <li v-for="item in diseaseItems" :key="item.sickKey" class="list-item card-like">
              <div class="pest-item-row">
                <img v-if="imgUrl(item.thumbImg)" :src="imgUrl(item.thumbImg)" :alt="item.sickNameKor" class="pest-thumb" />
                <div class="pest-item-body">
                  <p class="item-title">{{ item.sickNameKor }}</p>
                  <p v-if="item.sickNameEng" class="muted" style="font-size:0.78rem; font-style:italic;">{{ item.sickNameEng }}</p>
                  <button
                    class="ghost compact-btn"
                    style="margin-top:0.35rem; width:fit-content;"
                    @click="toggleSearchDetail(item.sickKey, 'disease')"
                  >
                    {{ searchExpandedId === item.sickKey ? '▲ 닫기' : '▼ 상세보기' }}
                  </button>
                </div>
              </div>
              <div v-if="searchExpandedId === item.sickKey" class="search-detail-panel">
                <p v-if="searchDetailLoading" class="muted" style="font-size:0.82rem;">불러오는 중...</p>
                <p v-else-if="searchDetailError" style="color:var(--danger);font-size:0.82rem;">{{ searchDetailError }}</p>
                <template v-else-if="searchDetailData">
                  <div v-if="searchDetailData.symptoms" class="detail-section">
                    <p class="detail-label">병 증상</p>
                    <p class="detail-content">{{ stripHtml(searchDetailData.symptoms) }}</p>
                  </div>
                  <div v-if="searchDetailData.preventionMethod" class="detail-section">
                    <p class="detail-label">방제방법</p>
                    <p class="detail-content">{{ stripHtml(searchDetailData.preventionMethod) }}</p>
                  </div>
                  <div v-if="searchDetailData.developmentCondition" class="detail-section">
                    <p class="detail-label">발생생태</p>
                    <p class="detail-content">{{ stripHtml(searchDetailData.developmentCondition) }}</p>
                  </div>
                </template>
              </div>
            </li>
          </ul>
          <div v-if="diseaseTotal > PAGE_SIZE" class="row-actions" style="margin-top:0.75rem; justify-content:center;">
            <button class="ghost compact-btn" :disabled="diseasePage <= 1 || loading" @click="loadDiseases(diseasePage - 1)">이전</button>
            <span class="muted" style="font-size:0.85rem;">{{ diseasePage }} / {{ totalPages(diseaseTotal) }}</span>
            <button class="ghost compact-btn" :disabled="diseasePage >= totalPages(diseaseTotal) || loading" @click="loadDiseases(diseasePage + 1)">다음</button>
          </div>
        </template>

        <!-- 병원체 목록 (SVC02) + 상세 (SVC06) -->
        <template v-if="searchMode === 'pathogen'">
          <ul v-if="pathogenItems.length" class="list clean">
            <li v-for="item in pathogenItems" :key="item.virusKey" class="list-item card-like">
              <div class="pest-item-row">
                <img v-if="imgUrl(item.thumbImg)" :src="imgUrl(item.thumbImg)" :alt="item.virusName" class="pest-thumb" />
                <div class="pest-item-body">
                  <p class="item-title">{{ item.virusName }}</p>
                  <p class="item-meta">
                    <span class="pill" style="font-size:0.75rem;">{{ item.virusGroup }}</span>
                    &nbsp;{{ item.sickNameKor }}
                  </p>
                  <button
                    class="ghost compact-btn"
                    style="margin-top:0.35rem; width:fit-content;"
                    @click="toggleSearchDetail(item.virusKey, 'pathogen')"
                  >
                    {{ searchExpandedId === item.virusKey ? '▲ 닫기' : '▼ 상세보기' }}
                  </button>
                </div>
              </div>
              <div v-if="searchExpandedId === item.virusKey" class="search-detail-panel">
                <p v-if="searchDetailLoading" class="muted" style="font-size:0.82rem;">불러오는 중...</p>
                <p v-else-if="searchDetailError" style="color:var(--danger);font-size:0.82rem;">{{ searchDetailError }}</p>
                <template v-else-if="searchDetailData">
                  <div v-if="searchDetailData.virusCharacteristic" class="detail-section">
                    <p class="detail-label">병원체 특징</p>
                    <p class="detail-content">{{ stripHtml(searchDetailData.virusCharacteristic) }}</p>
                  </div>
                  <div v-if="searchDetailData.virusAbbreviation" class="detail-section">
                    <p class="detail-label">약어</p>
                    <p class="detail-content">{{ searchDetailData.virusAbbreviation }}</p>
                  </div>
                  <div v-if="searchDetailData.virusGroup" class="detail-section">
                    <p class="detail-label">분류</p>
                    <p class="detail-content">{{ searchDetailData.virusGroup }}</p>
                  </div>
                </template>
              </div>
            </li>
          </ul>
          <div v-if="pathogenTotal > PAGE_SIZE" class="row-actions" style="margin-top:0.75rem; justify-content:center;">
            <button class="ghost compact-btn" :disabled="pathogenPage <= 1 || loading" @click="loadPathogens(pathogenPage - 1)">이전</button>
            <span class="muted" style="font-size:0.85rem;">{{ pathogenPage }} / {{ totalPages(pathogenTotal) }}</span>
            <button class="ghost compact-btn" :disabled="pathogenPage >= totalPages(pathogenTotal) || loading" @click="loadPathogens(pathogenPage + 1)">다음</button>
          </div>
        </template>

        <!-- 해충 목록 (SVC03) + 상세 (SVC07) -->
        <template v-if="searchMode === 'insect'">
          <ul v-if="insectItems.length" class="list clean">
            <li v-for="item in insectItems" :key="item.insectKey" class="list-item card-like">
              <div class="pest-item-row">
                <img v-if="imgUrl(item.thumbImg)" :src="imgUrl(item.thumbImg)" :alt="item.insectKorName" class="pest-thumb" />
                <div class="pest-item-body">
                  <p class="item-title">{{ item.insectKorName }}</p>
                  <p v-if="item.speciesName" class="muted" style="font-size:0.78rem; font-style:italic;">{{ item.speciesName }}</p>
                  <button
                    class="ghost compact-btn"
                    style="margin-top:0.35rem; width:fit-content;"
                    @click="toggleSearchDetail(item.insectKey, 'insect')"
                  >
                    {{ searchExpandedId === item.insectKey ? '▲ 닫기' : '▼ 상세보기' }}
                  </button>
                </div>
              </div>
              <div v-if="searchExpandedId === item.insectKey" class="search-detail-panel">
                <p v-if="searchDetailLoading" class="muted" style="font-size:0.82rem;">불러오는 중...</p>
                <p v-else-if="searchDetailError" style="color:var(--danger);font-size:0.82rem;">{{ searchDetailError }}</p>
                <template v-else-if="searchDetailData">
                  <div v-if="searchDetailData.damageInfo" class="detail-section">
                    <p class="detail-label">피해정보</p>
                    <p class="detail-content">{{ stripHtml(searchDetailData.damageInfo) }}</p>
                  </div>
                  <div v-if="searchDetailData.ecologyInfo" class="detail-section">
                    <p class="detail-label">생태정보</p>
                    <p class="detail-content">{{ stripHtml(searchDetailData.ecologyInfo) }}</p>
                  </div>
                  <div v-if="searchDetailData.preventMethod" class="detail-section">
                    <p class="detail-label">방제방법</p>
                    <p class="detail-content">{{ stripHtml(searchDetailData.preventMethod) }}</p>
                  </div>
                </template>
              </div>
            </li>
          </ul>
          <div v-if="insectTotal > PAGE_SIZE" class="row-actions" style="margin-top:0.75rem; justify-content:center;">
            <button class="ghost compact-btn" :disabled="insectPage <= 1 || loading" @click="loadInsects(insectPage - 1)">이전</button>
            <span class="muted" style="font-size:0.85rem;">{{ insectPage }} / {{ totalPages(insectTotal) }}</span>
            <button class="ghost compact-btn" :disabled="insectPage >= totalPages(insectTotal) || loading" @click="loadInsects(insectPage + 1)">다음</button>
          </div>
        </template>

      </template>

      <!-- ═══════════ 병해충예측 ═══════════ -->
      <template v-if="activeTab === 'prediction'">
        <div v-if="!loading && !predItems.length && !error" class="no-cache-state">
          <p>저장된 예측 데이터가 없습니다.</p>
          <button :disabled="loading" @click="fetchPrediction">최신 정보 가져오기</button>
        </div>
        <ul v-if="predItems.length" class="list clean">
          <li v-for="item in predItems" :key="item.code" class="list-item card-like">
            <div class="pred-header">
              <p class="item-title">{{ item.name }}</p>
              <span
                class="pred-badge"
                :style="{ background: riskColor(item.riskIdx, item.stageCount) }"
              >{{ item.currentStage ? item.currentStage.name : '정상' }}</span>
            </div>
            <p v-if="item.currentStage?.desc" class="item-meta" style="margin-top: 0.2rem;">
              {{ item.currentStage.desc }}
            </p>
            <p class="muted" style="font-size: 0.78rem; margin-top: 0.3rem;">
              예측기간: {{ item.period }} · 최종갱신: {{ item.lastRun }}
            </p>
          </li>
        </ul>
      </template>

      <!-- ═══════════ 병해충예찰 ═══════════ -->
      <template v-if="activeTab === 'surveillance'">
        <div class="sort-filter-bar">
          <span class="filter-label">조사연도</span>
          <select v-model="survYear" class="compact-select">
            <option v-for="y in YEARS" :key="y" :value="y">{{ y }}년</option>
          </select>
          <button class="compact-btn" :disabled="loading" @click="fetchSurveillance">
            {{ loading ? localeStore.t('pest.loading') : '최신 정보 가져오기' }}
          </button>
        </div>
        <p v-if="!loading && !survItems.length && !error" class="muted" style="text-align:center; padding: 1.5rem 1rem;">
          저장된 예찰 데이터가 없습니다.
        </p>
        <ul v-if="survItems.length" class="list clean">
          <li v-for="item in survItems" :key="item.insectKey" class="list-item card-like">
            <div class="row-actions align-start">
              <p class="item-title">{{ item.predictnSpchcknNm ?? '-' }}</p>
              <span class="pill" style="font-size: 0.75rem;">{{ item.examinSpchcknNm ?? '-' }}</span>
            </div>
            <p class="item-meta">
              {{ item.kncrNm ?? '-' }}
              &nbsp;·&nbsp;{{ item.examinYear ?? survYear }}년
              &nbsp;·&nbsp;{{ item.examinTmrd != null ? item.examinTmrd + '회차' : '-' }}
            </p>
            <p v-if="item.inputStdrDatetm" class="muted" style="font-size: 0.8rem;">
              조사기준일: {{ item.inputStdrDatetm }}
            </p>
            <button
              class="ghost compact-btn"
              style="margin-top: 0.35rem; width: fit-content;"
              @click="toggleSurvDetail(item)"
            >
              {{ survExpandedKey === item.insectKey ? '▲ 시군구별 상세 닫기' : '▼ 제주 시군구별 상세 보기' }}
            </button>

            <!-- SVC53 시군구별 상세 패널 -->
            <div v-if="survExpandedKey === item.insectKey" class="surv-detail-panel">
              <p v-if="survDetailLoading" class="muted" style="font-size: 0.82rem;">불러오는 중...</p>
              <p v-else-if="survDetailError" class="muted" style="color: var(--danger); font-size: 0.82rem;">{{ survDetailError }}</p>
              <template v-else-if="survDetailItems.length">
                <p class="muted" style="font-size: 0.78rem; margin-bottom: 0.6rem;">제주특별자치도 시군구별 발생 현황</p>
                <div
                  v-for="group in groupBySigungu(survDetailItems)"
                  :key="group.city"
                  class="surv-group"
                >
                  <p class="surv-group-title">{{ group.city }}</p>
                  <table class="surv-table">
                    <thead>
                      <tr>
                        <th>병해충명</th>
                        <th>조회값</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(d, di) in group.list" :key="di" :class="{ 'surv-row-highlight': d.inqireValue > 0 }">
                        <td>{{ d.dbyhsNm }}</td>
                        <td class="surv-val">{{ d.inqireValue }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </template>
              <p v-else class="muted" style="font-size: 0.82rem;">제주 시군구 데이터가 없습니다.</p>
            </div>
          </li>
        </ul>
      </template>

      <p v-if="loading" class="muted" style="margin-top: 0.75rem;">
        {{ localeStore.t('pest.loading') }}
      </p>
    </article>
  </section>
</template>

<style scoped>
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
.cache-banner-time {
  font-size: 0.78rem;
  opacity: 0.8;
  white-space: nowrap;
}
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
  padding: 2rem 1rem;
  color: var(--muted);
}
.no-cache-state p { margin: 0 0 0.75rem; font-size: 0.9rem; }
.no-cache-state button { font-size: 0.85rem; }

.pest-error {
  background: #fde2dd;
  border: 1px solid #efb3a9;
  color: #8f1f13;
  border-radius: 0.65rem;
  padding: 0.6rem 0.85rem;
  margin-bottom: 0.75rem;
  font-size: 0.88rem;
  display: grid;
  gap: 0.25rem;
}

.pest-item-row {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
}

.pest-thumb {
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: 0.5rem;
  border: 1px solid var(--line);
  flex-shrink: 0;
}

.pest-item-body {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 0.2rem;
}

.pest-count {
  font-size: 0.78rem;
  opacity: 0.75;
}

.pest-submode-active {
  background: var(--surface-strong);
  border-color: var(--primary);
  color: var(--primary);
  font-weight: 600;
}

.search-detail-panel {
  margin-top: 0.6rem;
  padding-top: 0.6rem;
  border-top: 1px dashed var(--line);
  display: grid;
  gap: 0.6rem;
}

.detail-section {
  display: grid;
  gap: 0.15rem;
}

.detail-label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
  margin: 0;
}

.detail-content {
  font-size: 0.83rem;
  line-height: 1.55;
  white-space: pre-line;
  margin: 0;
}

.pred-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}

.pred-badge {
  flex-shrink: 0;
  font-size: 0.75rem;
  font-weight: 700;
  color: #fff;
  padding: 0.2rem 0.55rem;
  border-radius: 0.4rem;
  white-space: nowrap;
}

.surv-detail-panel {
  margin-top: 0.6rem;
  padding-top: 0.6rem;
  border-top: 1px dashed var(--line);
}

.surv-group {
  margin-bottom: 0.85rem;
}

.surv-group-title {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--muted);
  margin: 0 0 0.3rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.surv-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.surv-table th {
  text-align: left;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--muted);
  padding: 0.25rem 0.5rem;
  border-bottom: 1px solid var(--line);
}

.surv-table td {
  padding: 0.3rem 0.5rem;
  border-bottom: 1px dashed var(--line);
}

.surv-val {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 600;
  text-align: right;
  color: var(--muted);
}

.surv-row-highlight td {
  color: var(--text);
}

.surv-row-highlight .surv-val {
  color: var(--primary);
}
</style>

<script setup>
import { ref, onMounted } from 'vue'
import { getDiseaseDetail, getPathogenDetail, getInsectDetail, getFromFullPestCache, warmFullPestCache } from '../services/ncpms.js'
import { useLocaleStore } from '../stores/localeStore'
import { useFarmsStore } from '../stores/farmsStore.js'
import { withCache, formatFetchedAt } from '../services/cache.js'

const localeStore = useLocaleStore()
const farmsStore = useFarmsStore()

const loading = ref(false)
const error = ref('')
const cacheInfo = ref(null) // { error, fetchedAt } | null

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

// 서브탭 카운트는 현재 보고 있는 서브탭과 무관하게 항상 표시되어야 하므로,
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

function totalPages(total) {
  return Math.max(1, Math.ceil(total / PAGE_SIZE))
}

// NCPMS 이미지 URL이 http:// → 브라우저 혼합 콘텐츠 차단 대비 https로 변환
function imgUrl(url) {
  if (!url) return ''
  return url.replace(/^http:\/\/ncpms\.rda\.go\.kr/, 'https://ncpms.rda.go.kr')
}

onMounted(() => {
  refreshCounts()
  loadSearchTab()
})
</script>

<template>
  <!-- 오류 배너 -->
  <div v-if="error" class="pest-error">
    <strong>{{ localeStore.t('pest.apiError') }}</strong>
    <span style="white-space: pre-line;">{{ error }}</span>
  </div>

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

  <!-- 캐시 배너 -->
  <div v-if="cacheInfo" class="cache-banner" :class="{ 'cache-warn': cacheInfo.error }">
    <span class="cache-banner-icon">{{ cacheInfo.error ? '⚠' : 'ℹ' }}</span>
    <span v-if="cacheInfo.error" class="cache-banner-msg">API 오류 · </span>
    <span class="cache-banner-time">{{ formatFetchedAt(cacheInfo.fetchedAt) }} 기준 데이터</span>
    <div v-if="farmsStore.isAdminMode" class="cache-banner-actions">
      <button class="cache-refresh-btn" :disabled="loading" @click="fetchLatestSearch">
        {{ loading ? '가져오는 중...' : '최신 정보 가져오기' }}
      </button>
    </div>
  </div>

  <!-- 검색탭 캐시 없을 때 새로고침 유도 -->
  <div v-if="!loading && !cacheInfo && !error" class="no-cache-state">
    <p>저장된 데이터가 없습니다.</p>
    <button v-if="farmsStore.isAdminMode" :disabled="loading" @click="fetchLatestSearch">최신 정보 가져오기</button>
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

  <p v-if="loading" class="muted" style="margin-top: 0.75rem;">
    {{ localeStore.t('pest.loading') }}
  </p>
</template>

<style scoped>
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

/* button.ghost(요소+클래스)보다 우선하도록 클래스 두 개를 겹쳐 특정도를 높인다 */
.ghost.pest-submode-active {
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
</style>

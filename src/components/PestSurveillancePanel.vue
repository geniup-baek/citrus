<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import {
  getSurveillance,
  getSurveillanceDetailByGungu,
  normalizeList,
  warmSurvDetails,
  getSurveillanceFromCache,
} from '../services/ncpms.js'
import { useLocaleStore } from '../stores/localeStore'
import { useFarmsStore } from '../stores/farmsStore.js'
import { withCache, formatFetchedAt, pullSharedCache } from '../services/cache.js'

const localeStore = useLocaleStore()
const farmsStore = useFarmsStore()

const loading = ref(false)
const error = ref('')
const cacheInfo = ref(null) // { error, fetchedAt } | null
const fetchProgress = ref(null) // { done, total } | null

const YEARS = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i))

const yearFilter = ref(String(new Date().getFullYear())) // '' = 전체
const survItemsAll = ref([])
const survExpandedKey = ref('')
const survDetailItems = ref([])
const survDetailLoading = ref(false)
const survDetailError = ref('')

const filteredSurvItems = computed(() => {
  if (!yearFilter.value) return survItemsAll.value
  return survItemsAll.value.filter(item => item._year === yearFilter.value)
})

const availableYears = computed(() => YEARS.filter(y => survItemsAll.value.some(item => item._year === y)))

function applyAllFromCache() {
  const merged = []
  let latestFetchedAt = null
  for (const year of YEARS) {
    const cached = getSurveillanceFromCache(year)
    if (!cached) continue
    merged.push(...normalizeList(cached.result).map(item => ({ ...item, _year: year })))
    if (!latestFetchedAt || cached.fetchedAt > latestFetchedAt) latestFetchedAt = cached.fetchedAt
  }
  survItemsAll.value = merged
  cacheInfo.value = latestFetchedAt ? { error: null, fetchedAt: latestFetchedAt } : null
}

async function loadCachedSurveillance() {
  applyAllFromCache()
  // 다른 기기(관리자 PC 등)에서 미리 올려둔 Firestore 공유 캐시가 로컬보다 최신이면 반영
  await Promise.all(YEARS.map(year => pullSharedCache(`pest:surveillance:${year}`)))
  applyAllFromCache()
}

async function fetchAllSurveillance() {
  survExpandedKey.value = ''
  survDetailItems.value = []
  loading.value = true
  error.value = ''
  fetchProgress.value = { done: 0, total: YEARS.length }
  const errors = []
  for (const year of YEARS) {
    try {
      const { result } = await withCache(
        `pest:surveillance:${year}`,
        () => getSurveillance({ year }),
      )
      const items = normalizeList(result)
      if (items.length > 0) await warmSurvDetails(year, items)
    } catch (e) {
      errors.push(`${year}년: ${e.message}`)
    }
    fetchProgress.value = { done: fetchProgress.value.done + 1, total: YEARS.length }
  }
  error.value = errors.join('\n')
  loading.value = false
  fetchProgress.value = null
  applyAllFromCache()
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
      `pest:surv:detail:${item._year}:${key}`,
      () => getSurveillanceDetailByGungu({ insectKey: key }),
    )
    survDetailItems.value = normalizeList(result)
  } catch (e) {
    survDetailError.value = e.message
  } finally {
    survDetailLoading.value = false
  }
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

watch(yearFilter, () => {
  survExpandedKey.value = ''
  survDetailItems.value = []
})

onMounted(() => {
  loadCachedSurveillance()
})
</script>

<template>
  <div v-if="error" class="pest-error">
    <strong>{{ localeStore.t('pest.apiError') }}</strong>
    <span style="white-space: pre-line;">{{ error }}</span>
  </div>

  <div v-if="cacheInfo" class="cache-banner" :class="{ 'cache-warn': cacheInfo.error }">
    <span class="cache-banner-icon">{{ cacheInfo.error ? '⚠' : 'ℹ' }}</span>
    <span v-if="cacheInfo.error" class="cache-banner-msg">API 오류 · </span>
    <span class="cache-banner-time">{{ formatFetchedAt(cacheInfo.fetchedAt) }} 기준 데이터</span>
    <div v-if="farmsStore.isAdminMode" class="cache-banner-actions">
      <button class="cache-refresh-btn" :disabled="loading" @click="fetchAllSurveillance">
        {{ loading
          ? `가져오는 중... (${fetchProgress?.done ?? 0}/${fetchProgress?.total ?? YEARS.length})`
          : '최신 정보 가져오기' }}
      </button>
    </div>
  </div>
  <div v-if="!loading && !error && !cacheInfo" class="no-cache-state">
    <p>저장된 예찰 데이터가 없습니다.</p>
    <button v-if="farmsStore.isAdminMode" :disabled="loading" @click="fetchAllSurveillance">최신 정보 가져오기</button>
  </div>
  <p v-else-if="!loading && !error && cacheInfo && !filteredSurvItems.length" class="empty-msg">해당 연도의 예찰 데이터가 없습니다.</p>

  <div v-if="cacheInfo" class="type-filter">
    <button
      v-for="y in ['', ...availableYears]"
      :key="y || 'all'"
      class="ghost type-btn"
      :class="{ 'type-btn-active': yearFilter === y }"
      @click="yearFilter = y"
    >
      {{ y === '' ? '전체' : `${y}년` }}
    </button>
    <span v-if="filteredSurvItems.length" class="result-count">총 {{ filteredSurvItems.length }}건</span>
  </div>

  <ul v-if="filteredSurvItems.length" class="list clean">
    <li v-for="item in filteredSurvItems" :key="`${item._year}-${item.insectKey}`" class="list-item card-like">
      <div class="row-actions align-start">
        <p class="item-title">{{ item.predictnSpchcknNm ?? '-' }}</p>
        <span class="pill" style="font-size: 0.75rem;">{{ item.examinSpchcknNm ?? '-' }}</span>
      </div>
      <p class="item-meta">
        {{ item.kncrNm ?? '-' }}
        &nbsp;·&nbsp;{{ item.examinYear ?? item._year }}년
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

<style scoped>
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
/* button.ghost(요소+클래스)보다 우선하도록 클래스 두 개를 겹쳐 특정도를 높인다 */
.ghost.type-btn-active {
  background: var(--primary);
  color: var(--primary-ink);
  border-color: transparent;
}
.result-count { font-size: 0.8rem; color: var(--muted); }
.empty-msg { color: var(--muted); font-size: 0.875rem; text-align: center; padding: 2rem; }

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

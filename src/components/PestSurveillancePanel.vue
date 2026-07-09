<script setup>
import { ref, watch, onMounted } from 'vue'
import {
  getSurveillance,
  getSurveillanceDetailByGungu,
  normalizeList,
  warmSurvDetails,
  getSurveillanceFromCache,
} from '../services/ncpms.js'
import { useLocaleStore } from '../stores/localeStore'
import { useFarmsStore } from '../stores/farmsStore.js'
import { withCache, formatFetchedAt } from '../services/cache.js'

const localeStore = useLocaleStore()
const farmsStore = useFarmsStore()

const loading = ref(false)
const error = ref('')
const cacheInfo = ref(null) // { error, fetchedAt } | null

const survYear = ref(String(new Date().getFullYear()))
const survItems = ref([])
const survExpandedKey = ref('')
const survDetailItems = ref([])
const survDetailLoading = ref(false)
const survDetailError = ref('')

const YEARS = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i))

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

async function fetchSurveillance() {
  survExpandedKey.value = ''
  survDetailItems.value = []
  survItems.value = []
  loading.value = true
  error.value = ''
  cacheInfo.value = null
  try {
    const { result, fromCache, fetchedAt, cacheError } = await withCache(
      `pest:surveillance:${survYear.value}`,
      () => getSurveillance({ year: survYear.value }),
    )
    survItems.value = normalizeList(result)
    cacheInfo.value = { error: fromCache ? cacheError : null, fetchedAt }
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
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

watch(survYear, () => {
  loadCachedSurveillance()
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
  </div>

  <div class="sort-filter-bar">
    <span class="filter-label">조사연도</span>
    <select v-model="survYear" class="compact-select">
      <option v-for="y in YEARS" :key="y" :value="y">{{ y }}년</option>
    </select>
    <button v-if="farmsStore.isAdminMode" class="compact-btn" :disabled="loading" @click="fetchSurveillance">
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

  <p v-if="loading" class="muted" style="margin-top: 0.75rem;">
    {{ localeStore.t('pest.loading') }}
  </p>
</template>

<style scoped>
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

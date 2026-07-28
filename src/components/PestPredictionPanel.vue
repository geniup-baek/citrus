<script setup>
import { ref, onMounted } from 'vue'
import { getPrediction, normalizePrediction, getPredictionFromCache } from '../services/ncpms.js'
import { useLocaleStore } from '../stores/localeStore'
import { useFarmsStore } from '../stores/farmsStore.js'
import { withCache, formatFetchedAt } from '../services/cache.js'

const localeStore = useLocaleStore()
const farmsStore = useFarmsStore()

const loading = ref(false)
const error = ref('')
const cacheInfo = ref(null) // { error, fetchedAt } | null

const predItems = ref([])

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

async function fetchPrediction() {
  loading.value = true
  error.value = ''
  try {
    const { result, fromCache, fetchedAt, cacheError } = await withCache(
      'pest:prediction',
      () => getPrediction(),
    )
    predItems.value = normalizePrediction(result)
    cacheInfo.value = { error: fromCache ? cacheError : null, fetchedAt }
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function riskColor(riskIdx, stageCount) {
  if (riskIdx === 0 || stageCount === 0) return 'var(--muted)'
  const ratio = riskIdx / stageCount
  if (ratio >= 1) return '#e53935'
  if (ratio >= 0.5) return '#f08a24'
  return '#f5c518'
}

onMounted(() => {
  loadCachedPrediction()
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
      <button class="cache-refresh-btn" :disabled="loading" @click="fetchPrediction">
        {{ loading ? '가져오는 중...' : '최신 정보 가져오기' }}
      </button>
    </div>
  </div>

  <div v-if="!loading && !predItems.length && !error" class="no-cache-state">
    <p>저장된 예측 데이터가 없습니다.</p>
    <button v-if="farmsStore.isAdminMode" :disabled="loading" @click="fetchPrediction">최신 정보 가져오기</button>
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
      <p class="muted text-sm" style="margin-top: 0.3rem;">
        예측기간: {{ item.period }} · 최종갱신: {{ item.lastRun }}
      </p>
    </li>
  </ul>

  <p v-if="loading" class="muted" style="margin-top: 0.75rem;">
    {{ localeStore.t('pest.loading') }}
  </p>
</template>

<style scoped>
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
</style>

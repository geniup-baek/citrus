<script setup>
import { ref, computed, onMounted } from 'vue'
import { useLocaleStore } from '../stores/localeStore'
import { searchPesticides, getPesticideDetail, modeOfActionColor } from '../services/pesticide'

const localeStore = useLocaleStore()
const t = (k) => localeStore.t(k)

const pestNameInput = ref('')
const targetPestInput = ref('')
const typeFilter = ref('all') // 'all' | '살균' | '살충'

const items = ref([])
const total = ref(0)
const page = ref(1)
const PAGE_SIZE = 20
const loading = ref(false)
const error = ref('')

// 상세 패널: expandedId = pestiCode, detailMap = { pestiCode: detailData }
const expandedId = ref(null)
const detailMap = ref({})
const detailLoading = ref(false)

const isMock = !import.meta.env.VITE_AGRI_API_KEY

async function load() {
  loading.value = true
  error.value = ''
  try {
    const result = await searchPesticides({
      pestName: pestNameInput.value.trim(),
      targetPest: targetPestInput.value.trim(),
      pesticideType: typeFilter.value === 'all' ? '' : typeFilter.value,
      page: page.value,
      pageSize: PAGE_SIZE,
    })
    items.value = result.list
    total.value = result.total
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function search() {
  page.value = 1
  expandedId.value = null
  load()
}

async function toggleDetail(item) {
  if (expandedId.value === item.pestiCode) {
    expandedId.value = null
    return
  }
  expandedId.value = item.pestiCode
  if (detailMap.value[item.pestiCode]) return // 캐시 있으면 재사용
  detailLoading.value = true
  try {
    // SVC02: pestiCode + diseaseUseSeq 둘 다 필수
    detailMap.value[item.pestiCode] = await getPesticideDetail({
      pestiCode: item.pestiCode,
      diseaseUseSeq: item.diseaseUseSeq,
    })
  } catch {
    detailMap.value[item.pestiCode] = null
  } finally {
    detailLoading.value = false
  }
}

// 유형 필터는 API 조회 시 서버 필터로 처리하므로 여기서는 그대로 반환
const filteredItems = computed(() => items.value)

const totalPages = computed(() => Math.ceil(total.value / PAGE_SIZE))

function goPage(n) {
  page.value = n
  load()
}

onMounted(load)
</script>

<template>
  <div class="pesticide-view">
    <div class="view-header">
      <h2>{{ t('pesticide.title') }}</h2>
      <p class="subtitle">{{ t('pesticide.subtitle') }}<span v-if="isMock" class="mock-badge">샘플 데이터</span></p>
    </div>

    <!-- 검색 영역 -->
    <div class="search-bar">
      <input
        v-model="pestNameInput"
        type="text"
        :placeholder="t('pesticide.searchByName')"
        class="search-input"
        @keyup.enter="search"
      />
      <input
        v-model="targetPestInput"
        type="text"
        :placeholder="t('pesticide.searchByPest')"
        class="search-input"
        @keyup.enter="search"
      />
      <button class="btn-primary" @click="search" :disabled="loading">
        {{ loading ? t('pest.loading') : t('pest.query') }}
      </button>
    </div>

    <!-- 유형 필터 -->
    <div class="type-filter">
      <button
        v-for="opt in ['all', '살균', '살충']"
        :key="opt"
        class="type-btn"
        :class="{ active: typeFilter === opt }"
        @click="typeFilter = opt; search()"
      >
        {{ opt === 'all' ? t('pesticide.typeAll') : opt === '살균' ? t('pesticide.typeFungicide') : t('pesticide.typeInsecticide') }}
      </button>
      <span v-if="total > 0" class="result-count">{{ t('pest.totalCount').replace('{count}', total) }}</span>
    </div>

    <!-- 에러 -->
    <p v-if="error" class="error-msg">{{ t('pest.apiError') }} {{ error }}</p>

    <!-- 결과 없음 -->
    <p v-else-if="!loading && filteredItems.length === 0" class="empty-msg">{{ t('pest.noResults') }}</p>

    <!-- 목록 -->
    <div v-else class="pest-list">
      <div
        v-for="item in filteredItems"
        :key="item.pestiCode"
        class="pest-card"
      >
        <div class="pest-row" @click="toggleDetail(item)">
          <div class="pest-main">
            <span class="pest-name">{{ item.name }}</span>
            <span v-if="item.brandName && item.brandName !== item.name" class="brand-name">{{ item.brandName }}</span>
            <span class="type-tag" :class="item.pesticideType">{{ item.pesticideType }}</span>
          </div>
          <div class="pest-meta">
            <span class="meta-item">{{ item.ingredient }}</span>
            <span class="meta-sep">·</span>
            <span class="meta-item target-pest">{{ item.targetPest }}</span>
          </div>
          <div class="pest-right">
            <span
              class="moa-badge"
              :style="{ background: modeOfActionColor(item.modeOfAction) }"
              :title="t('pesticide.modeOfAction')"
            >
              {{ item.modeOfAction }}
            </span>
            <span class="toggle-arrow">{{ expandedId === item.pestiCode ? '▲' : '▼' }}</span>
          </div>
        </div>

        <!-- 상세 패널 -->
        <div v-if="expandedId === item.pestiCode" class="detail-panel">
          <p v-if="detailLoading && !detailMap[item.pestiCode]" class="detail-loading">조회 중...</p>
          <template v-else-if="detailMap[item.pestiCode]">
            <div class="detail-grid">
              <div class="detail-row">
                <span class="dlabel">{{ t('pesticide.ingredient') }}</span>
                <span class="dval">{{ detailMap[item.pestiCode].ingredient }} {{ detailMap[item.pestiCode].ingredientContent }}</span>
              </div>
              <div class="detail-row">
                <span class="dlabel">{{ t('pesticide.targetPest') }}</span>
                <span class="dval">{{ item.targetPest }}</span>
              </div>
              <div class="detail-row">
                <span class="dlabel">{{ t('pesticide.dilution') }}</span>
                <span class="dval">{{ item.dilution }}</span>
              </div>
              <div class="detail-row">
                <span class="dlabel">{{ t('pesticide.applicationMethod') }}</span>
                <span class="dval">{{ item.applicationMethod }}</span>
              </div>
              <div class="detail-row">
                <span class="dlabel">{{ t('pesticide.preHarvest') }}</span>
                <span class="dval">수확 {{ item.preHarvestDays }}일 전까지 / {{ item.maxApplications }}회 이내</span>
              </div>
              <div class="detail-row">
                <span class="dlabel">{{ t('pesticide.modeOfAction') }}</span>
                <span class="dval moa-detail">
                  <span class="moa-badge" :style="{ background: modeOfActionColor(item.modeOfAction) }">{{ item.modeOfAction }}</span>
                </span>
              </div>
              <div v-if="detailMap[item.pestiCode].toxicName" class="detail-row">
                <span class="dlabel">{{ t('pesticide.toxic') }}</span>
                <span class="dval">
                  {{ detailMap[item.pestiCode].toxicName }}
                  <span v-if="detailMap[item.pestiCode].fishToxic" class="fish-toxic">· 어독성: {{ detailMap[item.pestiCode].fishToxic }}</span>
                </span>
              </div>
              <div v-if="item.manufacturer" class="detail-row">
                <span class="dlabel">{{ t('pesticide.manufacturer') }}</span>
                <span class="dval">{{ item.manufacturer }}</span>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- 페이지네이션 -->
    <div v-if="totalPages > 1" class="pagination">
      <button :disabled="page === 1" @click="goPage(page - 1)">‹</button>
      <span>{{ page }} / {{ totalPages }}</span>
      <button :disabled="page === totalPages" @click="goPage(page + 1)">›</button>
    </div>
  </div>
</template>

<style scoped>
.pesticide-view {
  max-width: 860px;
  margin: 0 auto;
  padding: 1.5rem 1rem;
}

.view-header { margin-bottom: 1.25rem; }
.view-header h2 { margin: 0 0 0.25rem; font-size: 1.25rem; }
.subtitle {
  margin: 0;
  font-size: 0.8rem;
  color: var(--muted, #888);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.mock-badge {
  font-size: 0.7rem;
  background: #f08a24;
  color: #fff;
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
}

.search-bar {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}
.search-input {
  flex: 1;
  min-width: 140px;
  padding: 0.45rem 0.7rem;
  border: 1px solid var(--border, #ddd);
  border-radius: 6px;
  font-size: 0.875rem;
  background: var(--surface, #fff);
  color: var(--text, #222);
}
.btn-primary {
  padding: 0.45rem 1.1rem;
  background: var(--accent, #f08a24);
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  white-space: nowrap;
}
.btn-primary:disabled { opacity: 0.6; cursor: default; }

.type-filter {
  display: flex;
  gap: 0.4rem;
  align-items: center;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}
.type-btn {
  padding: 0.3rem 0.8rem;
  border: 1px solid var(--border, #ddd);
  border-radius: 20px;
  background: var(--surface, #fff);
  color: var(--text, #222);
  cursor: pointer;
  font-size: 0.8rem;
}
.type-btn.active {
  background: var(--accent, #f08a24);
  border-color: var(--accent, #f08a24);
  color: #fff;
}
.result-count {
  margin-left: auto;
  font-size: 0.8rem;
  color: var(--muted, #888);
}

.error-msg { color: #e53935; font-size: 0.875rem; }
.empty-msg { color: var(--muted, #888); font-size: 0.875rem; text-align: center; padding: 2rem; }

.pest-list { display: flex; flex-direction: column; gap: 0.4rem; }

.pest-card {
  border: 1px solid var(--border, #ddd);
  border-radius: 8px;
  overflow: hidden;
  background: var(--surface, #fff);
}

.pest-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.7rem 1rem;
  cursor: pointer;
  flex-wrap: wrap;
}
.pest-row:hover { background: var(--surface-hover, #f5f5f5); }

.pest-main {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 160px;
}
.pest-name { font-weight: 600; font-size: 0.9rem; }
.brand-name { font-size: 0.75rem; color: var(--muted, #888); }
.type-tag {
  font-size: 0.68rem;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  font-weight: 600;
}
.type-tag.살균 { background: #e8f5e9; color: #2e7d32; }
.type-tag.살충 { background: #fff3e0; color: #e65100; }

.pest-meta {
  flex: 1;
  font-size: 0.8rem;
  color: var(--muted, #888);
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex-wrap: wrap;
}
.meta-sep { opacity: 0.4; }
.target-pest { color: var(--text, #444); }

.pest-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}
.toggle-arrow { font-size: 0.7rem; color: var(--muted, #aaa); }

.moa-badge {
  display: inline-block;
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  letter-spacing: 0.02em;
}

.detail-loading { font-size: 0.8rem; color: var(--muted, #888); margin: 0.5rem 0; }
.fish-toxic { color: var(--muted, #888); font-size: 0.85em; }

.detail-panel {
  border-top: 1px solid var(--border, #eee);
  padding: 0.9rem 1rem;
  background: var(--surface-alt, #fafafa);
}
.detail-grid { display: flex; flex-direction: column; gap: 0.45rem; }
.detail-row {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 0.5rem;
  font-size: 0.83rem;
}
.dlabel { color: var(--muted, #888); }
.dval { color: var(--text, #222); }
.moa-detail { display: flex; align-items: center; gap: 0.5rem; }

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  margin-top: 1.5rem;
  font-size: 0.875rem;
}
.pagination button {
  padding: 0.3rem 0.8rem;
  border: 1px solid var(--border, #ddd);
  border-radius: 6px;
  background: var(--surface, #fff);
  cursor: pointer;
}
.pagination button:disabled { opacity: 0.4; cursor: default; }
</style>

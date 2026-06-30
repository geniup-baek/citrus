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
  if (detailMap.value[item.pestiCode]) return
  detailLoading.value = true
  try {
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
      <button @click="search" :disabled="loading">
        {{ loading ? t('pest.loading') : t('pest.query') }}
      </button>
    </div>

    <div class="type-filter">
      <button
        v-for="opt in ['all', '살균', '살충']"
        :key="opt"
        class="ghost type-btn"
        :class="{ 'type-btn-active': typeFilter === opt }"
        @click="typeFilter = opt; search()"
      >
        {{ opt === 'all' ? t('pesticide.typeAll') : opt === '살균' ? t('pesticide.typeFungicide') : t('pesticide.typeInsecticide') }}
      </button>
      <span v-if="total > 0" class="result-count">{{ t('pest.totalCount').replace('{count}', total) }}</span>
    </div>

    <p v-if="error" class="error-msg">{{ t('pest.apiError') }} {{ error }}</p>
    <p v-else-if="!loading && filteredItems.length === 0" class="empty-msg">{{ t('pest.noResults') }}</p>

    <div v-else class="pest-list">
      <div
        v-for="item in filteredItems"
        :key="item.pestiCode"
        class="card pest-card"
      >
        <div class="pest-row" @click="toggleDetail(item)">
          <div class="pest-main">
            <span class="pest-name">{{ item.name }}</span>
            <span v-if="item.brandName && item.brandName !== item.name" class="brand-name">{{ item.brandName }}</span>
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
            <span class="toggle-arrow">{{ expandedId === item.pestiCode ? '▲' : '▼' }}</span>
          </div>
        </div>

        <div v-if="expandedId === item.pestiCode" class="detail-panel">
          <p v-if="detailLoading && !detailMap[item.pestiCode]" class="item-meta">조회 중...</p>
          <template v-else-if="detailMap[item.pestiCode]">
            <div class="detail-grid">
              <div class="detail-row">
                <span class="dlabel">{{ t('pesticide.ingredient') }}</span>
                <span>{{ detailMap[item.pestiCode].ingredient }} {{ detailMap[item.pestiCode].ingredientContent }}</span>
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
                <span>수확 {{ item.preHarvestDays }}일 전까지 / {{ item.maxApplications }}회 이내</span>
              </div>
              <div class="detail-row">
                <span class="dlabel">{{ t('pesticide.modeOfAction') }}</span>
                <span class="moa-detail">
                  <span class="moa-badge" :style="{ background: modeOfActionColor(item.modeOfAction) }">{{ item.modeOfAction }}</span>
                </span>
              </div>
              <div v-if="detailMap[item.pestiCode].toxicName" class="detail-row">
                <span class="dlabel">{{ t('pesticide.toxic') }}</span>
                <span>
                  {{ detailMap[item.pestiCode].toxicName }}
                  <span v-if="detailMap[item.pestiCode].fishToxic" class="item-meta"> · 어독성: {{ detailMap[item.pestiCode].fishToxic }}</span>
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
.pesticide-view { max-width: 860px; margin: 0 auto; }

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
.result-count { margin-left: auto; font-size: 0.8rem; color: var(--muted); }

.error-msg { color: var(--danger); font-size: 0.875rem; }
.empty-msg { color: var(--muted); font-size: 0.875rem; text-align: center; padding: 2rem; }

.pest-list { display: flex; flex-direction: column; gap: 0.6rem; }

.pest-card { padding: 0; overflow: hidden; }

.pest-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.8rem 1rem;
  cursor: pointer;
  flex-wrap: wrap;
  border-radius: 1rem;
}
.pest-row:hover { background: var(--surface-strong); border-radius: 1rem 1rem 0 0; }

.pest-main { display: flex; align-items: center; gap: 0.4rem; min-width: 160px; }
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
  flex: 1;
  font-size: 0.8rem;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex-wrap: wrap;
}
.meta-sep { opacity: 0.35; }
.target-pest { color: var(--text); }

.pest-right { display: flex; align-items: center; gap: 0.5rem; margin-left: auto; }
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

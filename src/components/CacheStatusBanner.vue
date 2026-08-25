<script setup>
// 공공데이터 공유 캐시 상태 배너 — "N월 N일 기준 데이터" + (관리 모드에서만) 새로고침 버튼.
// PesticideSearchPanel/PestSearchPanel/PestPredictionPanel/PestSurveillancePanel이 전부 이
// 마크업을 복사해 갖고 있던 것을 여기 하나로 모았다(MAINTENANCE.md 6.5 "공공데이터 캐싱" 참고).
import { formatFetchedAt } from '../services/cache.js'

defineProps({
  cacheInfo: { type: Object, default: null }, // { error, fetchedAt } | null — 없으면 배너 자체를 숨긴다
  loading: { type: Boolean, default: false },
  showRefresh: { type: Boolean, default: false }, // 보통 farmsStore.isAdminMode
  refreshLabel: { type: String, default: '최신 정보 가져오기' },
  loadingLabel: { type: String, default: '가져오는 중...' },
})
defineEmits(['refresh'])
</script>

<template>
  <div v-if="cacheInfo" class="cache-banner" :class="{ 'cache-warn': cacheInfo.error }">
    <span class="cache-banner-icon">{{ cacheInfo.error ? '⚠' : 'ℹ' }}</span>
    <span v-if="cacheInfo.error" class="cache-banner-msg">API 오류 · </span>
    <span class="cache-banner-time">{{ formatFetchedAt(cacheInfo.fetchedAt) }} 기준 데이터</span>
    <div v-if="showRefresh" class="cache-banner-actions">
      <!-- 기본은 버튼 하나. 여러 버튼(예: 상세정보 전체 가져오기)이 필요하면 슬롯으로 대체한다. -->
      <slot>
        <button class="cache-refresh-btn" type="button" :disabled="loading" @click="$emit('refresh')">
          {{ loading ? loadingLabel : refreshLabel }}
        </button>
      </slot>
    </div>
  </div>
</template>

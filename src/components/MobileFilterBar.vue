<script setup>
// 패널의 필터 컨트롤을 모바일에서는 "필터 ▾" 버튼 뒤의 바텀시트로 접어 넣는다.
// 데스크톱에서는 기존 .sort-filter-bar 마크업을 그대로(픽셀 동일하게) 인라인 렌더한다.
//
// 사용법 (PesticideInventoryPanel.vue 예):
//   <MobileFilterBar :active="activeFilters" :on-reset-all="clearAllFilters">
//     <template #always>
//       <span class="summary-chip">...</span>
//     </template>
//     <!-- 기존 필터 마크업을 그대로 옮긴다 -->
//     <select v-model="sortBy" class="compact-select">...</select>
//     ...
//   </MobileFilterBar>
//
// 슬롯 내용은 호출부(패널)의 스코프에서 컴파일되므로 v-model/ref 는 모바일이든
// 데스크톱이든 패널 자신의 상태를 그대로 읽고 쓴다 — 이 컴포넌트는 위치만 바꾼다.
import { computed, ref } from 'vue'
import { useIsMobile } from '../composables/useIsMobile'
import BottomSheet from './BottomSheet.vue'

const props = defineProps({
  // 현재 적용 중인 필터 요약. [{ key, label, clear() }] — 모바일 바에 제거 가능한
  // 칩으로 나열된다.
  active: { type: Array, default: () => [] },
  title: { type: String, default: '필터' },
  onResetAll: { type: Function, default: null },
})

const { isMobile } = useIsMobile()
const open = ref(false)
const count = computed(() => props.active.length)
</script>

<template>
  <!-- 데스크톱: 기존과 동일한 DOM -->
  <div v-if="!isMobile" class="sort-filter-bar">
    <slot name="always" />
    <slot />
  </div>

  <!-- 모바일: 항상 보여야 하는 것(건수 칩 등) + 필터 버튼 + 적용된 필터 칩 -->
  <template v-else>
    <div class="sort-filter-bar">
      <slot name="always" />
      <button class="ghost compact-btn mfb-open" type="button" @click="open = true">
        {{ title }}<span v-if="count" class="mfb-count">{{ count }}</span> ▾
      </button>
      <button
        v-for="f in active"
        :key="f.key"
        class="ghost ap-unmatched-btn ap-unmatched-active mfb-chip"
        type="button"
        @click="f.clear()"
      >{{ f.label }} ✕</button>
    </div>

    <BottomSheet v-model:open="open" :title="title">
      <div class="mfb-sheet-body"><slot /></div>
      <template #footer>
        <button v-if="onResetAll" class="ghost" type="button" @click="onResetAll(); open = false">필터 초기화</button>
        <button type="button" @click="open = false">닫기</button>
      </template>
    </BottomSheet>
  </template>
</template>

<style scoped>
.mfb-count {
  margin-left: 0.15rem;
  font-weight: 700;
}

.mfb-chip {
  white-space: nowrap;
}

.mfb-sheet-body {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.75rem;
}

.mfb-sheet-body :deep(.filter-sep) {
  display: none;
}

.mfb-sheet-body :deep(.filter-label) {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
}

.mfb-sheet-body :deep(select),
.mfb-sheet-body :deep(input[type='text']) {
  width: 100%;
}

.mfb-sheet-body :deep(.seg-filter) {
  width: 100%;
}

.mfb-sheet-body :deep(.seg-btn) {
  flex: 1 1 0;
  justify-content: center;
}

.mfb-sheet-body :deep(button:not(.seg-btn)) {
  width: 100%;
  justify-content: center;
}
</style>

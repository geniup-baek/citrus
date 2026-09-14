<script setup>
// 부차적인 액션 버튼들(PDF 출력/CSV 다운로드/초기화 등)을 모바일에서 "⋯" 버튼 뒤의
// 시트로 접어 넣는다. 데스크톱에서는 슬롯 내용을 그대로 인라인 렌더한다(픽셀 동일).
//
// 슬롯 안 버튼은 패널의 기존 마크업(v-if 게이팅 포함)을 그대로 옮기면 된다 —
// 예: v-if="showResetButton && ..." 는 그대로 두면 되므로 2단계 기능 게이팅
// (MAINTENANCE.md §6.4)이 자동으로 보존된다. 주 액션(편집/편집종료처럼 항상
// 눌리는 버튼)은 이 컴포넌트 밖에 그대로 두고, 부차 액션만 감싼다.
import { ref } from 'vue'
import { useIsMobile } from '../composables/useIsMobile'
import BottomSheet from './BottomSheet.vue'

defineProps({ title: { type: String, default: '더보기' } })
const { isMobile } = useIsMobile()
const open = ref(false)
</script>

<template>
  <!-- 데스크톱: 슬롯을 그대로 인라인 렌더 -->
  <template v-if="!isMobile"><slot /></template>

  <template v-else>
    <button class="ghost compact-btn ovf-trigger" type="button" :aria-label="title" @click="open = true">···</button>
    <!-- 버튼 클릭은 버블링으로 자신의 핸들러가 먼저 실행된 뒤 이 래퍼가 시트를 닫는다.
         핸들러가 ConfirmDialog(z-index 1100)를 띄우면 시트(1050) 위에 정상적으로 뜬다. -->
    <BottomSheet v-model:open="open" :title="title">
      <div class="ovf-list" @click="open = false"><slot /></div>
    </BottomSheet>
  </template>
</template>

<style scoped>
.ovf-trigger {
  min-width: 2.75rem;
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  line-height: 1;
}

.ovf-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.ovf-list :deep(button) {
  width: 100%;
  justify-content: center;
}
</style>

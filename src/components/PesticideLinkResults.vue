<script setup>
// 상표명 검색 결과 드롭다운 — "브랜드명 + 배지들 + 병해충 요약" 한 줄짜리 결과 항목을
// 그리고 클릭하면 적용하는 부분만 공통화한다. 바깥 테두리 박스와 검색창(input) 자체는
// 호출부마다 살짝 다르게 조합되어 있어(폼 필드에 바로 붙는 경우 / 별도 검색창인 경우)
// 그대로 두고, PesticideRecommendView.vue·PesticideInventoryPanel.vue에 6번 복붙되어
// 있던 "결과 목록을 어떻게 그리고 클릭하면 어떻게 되는지"만 여기로 모았다.
defineProps({
  results: { type: Array, default: () => [] },
  // 결과 항목의 고유 키를 뽑는 함수. 기본값은 이 앱에서 실제로 쓰이는 두 가지 모양
  // (그룹 검색 결과의 pestiCode+diseaseUseSeq, 또는 이미 key가 있는 경우)을 함께 처리한다.
  itemKey: {
    type: Function,
    default: (r, i) => r.key ?? (r.pestiCode !== undefined ? `${r.pestiCode}-${r.diseaseUseSeq ?? ''}` : i),
  },
})
defineEmits(['apply'])
</script>

<template>
  <!-- mousedown.prevent: 이 목록이 실제 입력칸 바로 아래 뜰 때, 클릭으로 입력칸이 먼저
       blur되어 목록이 닫혀버리는 것을 막는다(click보다 앞서 일어나는 이벤트라 안전하다). -->
  <div v-for="(r, i) in results" :key="itemKey(r, i)" class="plink-item" @mousedown.prevent="$emit('apply', r)">
    <span class="plink-brand">{{ r.brandName }}</span>
    <slot name="badges" :item="r" />
    <span class="plink-pest"><slot name="pest" :item="r">{{ r.targetPest }}</slot></span>
  </div>
</template>

<style scoped>
.plink-item {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem;
  padding: 0.38rem 0.65rem;
  cursor: pointer;
  font-size: 0.83rem;
  border-bottom: 1px solid var(--line);
}
.plink-item:last-child { border-bottom: none; }
.plink-item:hover { background: var(--surface-strong); }
.plink-brand { font-weight: 600; }
.plink-pest { font-size: 0.76rem; color: var(--muted); margin-left: auto; }
</style>

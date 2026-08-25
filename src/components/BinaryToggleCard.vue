<script setup>
// "제목 + 설명 + 두 버튼 중 하나 선택 + 부연설명" 카드 — SettingsView.vue의 "동작" 탭에
// 9번 복붙되어 있던 같은 모양의 이진 선택 설정을 여기 하나로 모았다.
defineProps({
  title: { type: String, required: true },
  hint: { type: String, default: '' }, // 제목 아래 한 줄 설명
  modelValue: { required: true },
  leftLabel: { type: String, required: true },
  leftValue: { default: false },
  rightLabel: { type: String, required: true },
  rightValue: { default: true },
})
defineEmits(['update:modelValue'])
</script>

<template>
  <div class="sub-card">
    <div class="settings-group-head">
      <h3>{{ title }}</h3>
    </div>
    <p v-if="hint" class="muted settings-group-hint">{{ hint }}</p>
    <div class="inline-filters">
      <button type="button" :class="{ ghost: modelValue !== leftValue }" @click="$emit('update:modelValue', leftValue)">{{ leftLabel }}</button>
      <button type="button" :class="{ ghost: modelValue !== rightValue }" @click="$emit('update:modelValue', rightValue)">{{ rightLabel }}</button>
    </div>
    <p class="muted text-sm" style="margin-top: 0.5rem;"><slot /></p>
  </div>
</template>

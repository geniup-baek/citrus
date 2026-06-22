<script setup>
defineProps({
  title: {
    type: String,
    required: true,
  },
  value: {
    type: [String, Number],
    required: true,
  },
  helper: {
    type: String,
    default: '',
  },
})
</script>

<template>
  <article class="stat-card">
    <p class="stat-title">{{ title }}</p>
    <p class="stat-value">{{ value }}</p>
    <p v-if="helper" class="stat-helper">{{ helper }}</p>
  </article>
</template>

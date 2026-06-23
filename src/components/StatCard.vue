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
  to: {
    type: String,
    default: '',
  },
})
</script>

<template>
  <router-link v-if="to" :to="to" class="stat-card stat-card-link">
    <p class="stat-title">{{ title }}</p>
    <p class="stat-value">{{ value }}</p>
    <p v-if="helper" class="stat-helper">{{ helper }}</p>
  </router-link>
  <article v-else class="stat-card">
    <p class="stat-title">{{ title }}</p>
    <p class="stat-value">{{ value }}</p>
    <p v-if="helper" class="stat-helper">{{ helper }}</p>
  </article>
</template>

<script setup>
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

const route = useRoute()

const links = [
  { to: '/', label: 'Dashboard' },
  { to: '/facilities', label: 'Facilities' },
  { to: '/seedlings', label: 'Seedlings' },
  { to: '/tasks', label: 'Tasks' },
  { to: '/issues', label: 'Issues' },
  { to: '/knowledge', label: 'Knowledge' },
]

const activePath = computed(() => route.path)
</script>

<template>
  <header class="app-header">
    <div>
      <p class="eyebrow">Citrus collaborative planner</p>
      <h1>Citrus Operations Hub</h1>
    </div>

    <nav class="main-nav" aria-label="Main navigation">
      <RouterLink
        v-for="link in links"
        :key="link.to"
        :to="link.to"
        class="nav-link"
        :class="{ active: activePath === link.to }"
      >
        {{ link.label }}
      </RouterLink>
    </nav>
  </header>
</template>

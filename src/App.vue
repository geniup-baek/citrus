<script setup>
import { onBeforeUnmount, onMounted } from 'vue'
import AppHeader from './components/AppHeader.vue'
import { useFarmStore } from './stores/farmStore'
import { useTaskNotifier } from './composables/useTaskNotifier'

const store = useFarmStore()

onMounted(async () => {
  await store.init()
})

onBeforeUnmount(() => {
  store.cleanup()
})

useTaskNotifier(store)
</script>

<template>
  <div class="app-shell">
    <AppHeader />

    <p v-if="!store.firebaseEnabled" class="sync-banner">
      Cloud sync is disabled. Add Firebase environment variables for team-wide shared data.
    </p>

    <main class="content">
      <RouterView />
    </main>
  </div>
</template>

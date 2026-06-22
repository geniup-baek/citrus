<script setup>
import { onBeforeUnmount, onMounted } from 'vue'
import AppHeader from './components/AppHeader.vue'
import { useFarmStore } from './stores/farmStore'
import { useLocaleStore } from './stores/localeStore'
import { useTaskNotifier } from './composables/useTaskNotifier'

const store = useFarmStore()
const localeStore = useLocaleStore()

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
      {{ localeStore.t('app.syncDisabled') }}
    </p>

    <main class="content">
      <RouterView />
    </main>
  </div>
</template>

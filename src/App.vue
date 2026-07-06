<script setup>
import { onBeforeUnmount, onMounted } from 'vue'
import AppHeader from './components/AppHeader.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import { useFarmStore } from './stores/farmStore'
import { useLocaleStore } from './stores/localeStore'
import { useTreatmentStore } from './stores/treatmentStore'
import { useAvailablePesticideStore } from './stores/availablePesticideStore'
import { useTaskNotifier } from './composables/useTaskNotifier'

const store = useFarmStore()
const localeStore = useLocaleStore()
const treatStore = useTreatmentStore()
const apStore = useAvailablePesticideStore()

onMounted(async () => {
  await store.init()
  treatStore.init()
  apStore.init()
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

    <ConfirmDialog />
  </div>
</template>

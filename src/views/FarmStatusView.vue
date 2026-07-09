<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { useLocaleStore } from '../stores/localeStore'
import FacilitiesPanel from '../components/FacilitiesPanel.vue'
import AncillaryPanel from '../components/AncillaryPanel.vue'
import SeedlingsPanel from '../components/SeedlingsPanel.vue'
import InventoryPanel from '../components/InventoryPanel.vue'

const localeStore = useLocaleStore()
const route = useRoute()

const TAB_KEYS = ['facilities', 'ancillary', 'seedlings', 'inventory']
const activeTab = ref(TAB_KEYS.includes(route.query.tab) ? route.query.tab : 'facilities')
</script>

<template>
  <div class="card farm-status-view">
    <div class="view-header">
      <h2>{{ localeStore.t('nav.farmStatus') }}</h2>
      <p class="subtitle">재배동·시설장비·묘목·비료 재고를 한 곳에서 관리합니다.</p>
    </div>

    <div class="tab-bar">
      <button class="tab-btn" :class="{ active: activeTab === 'facilities' }" @click="activeTab = 'facilities'">{{ localeStore.t('nav.facilities') }}</button>
      <button class="tab-btn" :class="{ active: activeTab === 'ancillary' }" @click="activeTab = 'ancillary'">{{ localeStore.t('nav.ancillary') }}</button>
      <button class="tab-btn" :class="{ active: activeTab === 'seedlings' }" @click="activeTab = 'seedlings'">{{ localeStore.t('nav.seedlings') }}</button>
      <button class="tab-btn" :class="{ active: activeTab === 'inventory' }" @click="activeTab = 'inventory'">{{ localeStore.t('nav.inventory') }}</button>
    </div>

    <FacilitiesPanel v-if="activeTab === 'facilities'" />
    <AncillaryPanel v-if="activeTab === 'ancillary'" />
    <SeedlingsPanel v-if="activeTab === 'seedlings'" />
    <InventoryPanel v-if="activeTab === 'inventory'" />
  </div>
</template>

<style scoped>
.farm-status-view .view-header { margin-bottom: 1rem; }
.farm-status-view .subtitle { margin: 0.2rem 0 0; font-size: 0.8rem; color: var(--muted); }
</style>

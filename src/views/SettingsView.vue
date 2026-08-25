<script setup>
import { ref } from 'vue'
import { useLocaleStore } from '../stores/localeStore'
import { useFarmsStore } from '../stores/farmsStore'
import FarmManagementPanel from '../components/FarmManagementPanel.vue'
import CategorySettingsPanel from '../components/CategorySettingsPanel.vue'
import BehaviorSettingsPanel from '../components/BehaviorSettingsPanel.vue'
import StorageBackupPanel from '../components/StorageBackupPanel.vue'
import ChangeHistoryPanel from '../components/ChangeHistoryPanel.vue'

const localeStore = useLocaleStore()
const farmsStore = useFarmsStore()

// 농장 모드에서는 저장·백업 탭만 사용할 수 있다(농장/분류·항목/동작은 시스템 관리 모드 전용).
const activeTab = ref(farmsStore.isAdminMode ? 'categories' : 'storage')
</script>

<template>
  <section class="page-grid">
    <div class="card">
      <h2>{{ localeStore.t('settings.title') }}</h2>

      <div class="tab-bar">
        <template v-if="farmsStore.isAdminMode">
          <button class="tab-btn" :class="{ active: activeTab === 'farm' }" type="button" @click="activeTab = 'farm'">농장</button>
          <button class="tab-btn" :class="{ active: activeTab === 'categories' }" type="button" @click="activeTab = 'categories'">분류·항목</button>
        </template>
        <button class="tab-btn" :class="{ active: activeTab === 'behavior' }" type="button" @click="activeTab = 'behavior'">동작</button>
        <button class="tab-btn" :class="{ active: activeTab === 'storage' }" type="button" @click="activeTab = 'storage'">저장·백업</button>
        <button v-if="!farmsStore.isAdminMode" class="tab-btn" :class="{ active: activeTab === 'history' }" type="button" @click="activeTab = 'history'">변경 이력</button>
      </div>

      <template v-if="farmsStore.isAdminMode && activeTab === 'farm'"><FarmManagementPanel /></template>
      <template v-if="farmsStore.isAdminMode && activeTab === 'categories'"><CategorySettingsPanel /></template>
      <template v-if="activeTab === 'behavior'"><BehaviorSettingsPanel /></template>
      <template v-if="activeTab === 'storage'"><StorageBackupPanel /></template>
      <template v-if="!farmsStore.isAdminMode && activeTab === 'history'"><ChangeHistoryPanel /></template>
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import { useLocaleStore } from '../stores/localeStore'
import PesticideSearchPanel from '../components/PesticideSearchPanel.vue'
import PestSearchPanel from '../components/PestSearchPanel.vue'
import PestPredictionPanel from '../components/PestPredictionPanel.vue'
import PestSurveillancePanel from '../components/PestSurveillancePanel.vue'
import KnowledgePanel from '../components/KnowledgePanel.vue'
import GlossaryPanel from '../components/GlossaryPanel.vue'

const localeStore = useLocaleStore()

const activeTab = ref('pesticide')
</script>

<template>
  <div class="card resources-view">
    <div class="view-header">
      <h2>{{ localeStore.t('nav.resources') }}</h2>
      <p class="subtitle">농약·병해충 참고정보와 재배 지식을 한 곳에서 찾아봅니다.</p>
    </div>

    <div class="tab-bar">
      <button class="tab-btn" :class="{ active: activeTab === 'pesticide' }" @click="activeTab = 'pesticide'">{{ localeStore.t('nav.pesticide') }}</button>
      <button class="tab-btn" :class="{ active: activeTab === 'search' }" @click="activeTab = 'search'">{{ localeStore.t('pest.tabSearch') }}</button>
      <button class="tab-btn" :class="{ active: activeTab === 'prediction' }" @click="activeTab = 'prediction'">{{ localeStore.t('pest.tabPrediction') }}</button>
      <button class="tab-btn" :class="{ active: activeTab === 'surveillance' }" @click="activeTab = 'surveillance'">{{ localeStore.t('pest.tabSurveillance') }}</button>
      <button class="tab-btn" :class="{ active: activeTab === 'knowledge' }" @click="activeTab = 'knowledge'">{{ localeStore.t('nav.knowledge') }}</button>
      <button class="tab-btn" :class="{ active: activeTab === 'glossary' }" @click="activeTab = 'glossary'">{{ localeStore.t('nav.glossary') }}</button>
    </div>

    <PesticideSearchPanel v-if="activeTab === 'pesticide'" />
    <PestSearchPanel v-if="activeTab === 'search'" />
    <PestPredictionPanel v-if="activeTab === 'prediction'" />
    <PestSurveillancePanel v-if="activeTab === 'surveillance'" />
    <KnowledgePanel v-if="activeTab === 'knowledge'" />
    <GlossaryPanel v-if="activeTab === 'glossary'" />
  </div>
</template>

<style scoped>
.view-header { margin-bottom: 1rem; }
.subtitle { margin: 0.2rem 0 0; font-size: 0.8rem; color: var(--muted); }
</style>

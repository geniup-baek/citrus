<script setup>
import { useLocaleStore } from '../stores/localeStore'

const localeStore = useLocaleStore()
</script>

<template>
  <section class="page-grid">
    <article class="card">
      <h2>{{ localeStore.t('knowledge.lineageMap') }}</h2>
      <p class="muted">
        {{ localeStore.t('knowledge.intro') }}
      </p>

      <div class="lineage-grid">
        <div class="lineage-node">
          <h3>Hallabong</h3>
          <p>{{ localeStore.t('knowledge.hallabongKnown') }}</p>
          <p class="muted">{{ localeStore.t('knowledge.hallabongParentage') }}</p>
        </div>
        <div class="lineage-node">
          <h3>Karahyang</h3>
          <p>{{ localeStore.t('knowledge.karahyangDesc') }}</p>
          <p class="muted">{{ localeStore.t('knowledge.karahyangGuide') }}</p>
        </div>
      </div>
    </article>

    <article class="card">
      <h2>{{ localeStore.t('knowledge.checklist') }}</h2>
      <ul class="list clean compact">
        <li class="list-item">
          <p class="item-title">{{ localeStore.t('knowledge.canopyClimate') }}</p>
          <p class="muted">{{ localeStore.t('knowledge.canopyClimateDesc') }}</p>
        </li>
        <li class="list-item">
          <p class="item-title">{{ localeStore.t('knowledge.brixTracking') }}</p>
          <p class="muted">{{ localeStore.t('knowledge.brixTrackingDesc') }}</p>
        </li>
        <li class="list-item">
          <p class="item-title">{{ localeStore.t('knowledge.irrigationHygiene') }}</p>
          <p class="muted">{{ localeStore.t('knowledge.irrigationHygieneDesc') }}</p>
        </li>
        <li class="list-item">
          <p class="item-title">{{ localeStore.t('knowledge.pestPolicy') }}</p>
          <p class="muted">{{ localeStore.t('knowledge.pestPolicyDesc') }}</p>
        </li>
      </ul>
    </article>
  </section>
</template>

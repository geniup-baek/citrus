<script setup>
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useLocaleStore } from '../stores/localeStore'
import { useFarmsStore } from '../stores/farmsStore'

const route = useRoute()
const localeStore = useLocaleStore()
const farmsStore = useFarmsStore()

const ADMIN_LINKS = [
  { to: '/pest', label: localeStore.t('nav.pest') },
  { to: '/pesticide', label: localeStore.t('nav.pesticide') },
  { to: '/settings', label: localeStore.t('settings.title') },
]

const links = computed(() => {
  if (farmsStore.isAdminMode) return ADMIN_LINKS
  return [
    { to: '/', label: localeStore.t('nav.dashboard') },
    { to: '/facilities', label: localeStore.t('nav.facilities') },
    { to: '/ancillary', label: localeStore.t('nav.ancillary') },
    { to: '/seedlings', label: localeStore.t('nav.seedlings') },
    { to: '/tasks', label: localeStore.t('nav.tasks') },
    { to: '/issues', label: localeStore.t('nav.issues') },
    { to: '/inventory', label: localeStore.t('nav.inventory') },
    { to: '/pesticide-recommend', label: localeStore.t('nav.pesticideRecommend') },
    { to: '/knowledge', label: localeStore.t('nav.knowledge') },
    { to: '/pest', label: localeStore.t('nav.pest') },
    { to: '/pesticide', label: localeStore.t('nav.pesticide') },
    { to: '/settings', label: localeStore.t('settings.title') },
  ]
})

const activePath = computed(() => route.path)

/* global __APP_VERSION__ */
const appVersion = __APP_VERSION__
</script>

<template>
  <header class="app-header">
    <div class="header-top-row">
      <div>
        <p class="eyebrow">{{ localeStore.t('header.eyebrow') }} <span class="app-version">(v{{ appVersion }})</span></p>
        <h1>{{ localeStore.t('header.title') }}</h1>
      </div>
      <div class="header-right">
        <div v-if="farmsStore.isAdminMode" class="active-farm-badge">
          <span class="admin-badge">시스템 관리 모드</span>
          <button class="ghost compact-btn" type="button" @click="farmsStore.exitToSelector">관리 모드 종료</button>
        </div>
        <div v-else-if="farmsStore.activeFarm" class="active-farm-badge">
          <span class="farm-logo-mini" :class="{ 'farm-logo-mini-empty': !farmsStore.activeFarm.logo }">
            <img v-if="farmsStore.activeFarm.logo" :src="farmsStore.activeFarm.logo" alt="" />
            <span v-else>{{ farmsStore.activeFarm.name?.[0] ?? '?' }}</span>
          </span>
          <span class="active-farm-name">{{ farmsStore.activeFarm.name }}</span>
          <button class="ghost compact-btn" type="button" @click="farmsStore.exitToSelector">농장 전환</button>
        </div>
      </div>
    </div>

    <nav class="main-nav" :aria-label="localeStore.t('nav.mainNavigation')">
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

<style scoped>
.header-top-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.active-farm-badge {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.active-farm-name {
  font-weight: 600;
}
.admin-badge {
  font-weight: 600;
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  background: var(--primary);
  color: var(--primary-ink);
  font-size: 0.85rem;
}
</style>

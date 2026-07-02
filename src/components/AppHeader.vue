<script setup>
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useLocaleStore } from '../stores/localeStore'

const route = useRoute()
const localeStore = useLocaleStore()

const links = computed(() => [
  { to: '/', label: localeStore.t('nav.dashboard') },
  { to: '/facilities', label: localeStore.t('nav.facilities') },
  { to: '/ancillary', label: localeStore.t('nav.ancillary') },
  { to: '/seedlings', label: localeStore.t('nav.seedlings') },
  { to: '/tasks', label: localeStore.t('nav.tasks') },
  { to: '/issues', label: localeStore.t('nav.issues') },
  { to: '/inventory', label: localeStore.t('nav.inventory') },
  { to: '/knowledge', label: localeStore.t('nav.knowledge') },
  { to: '/pest', label: localeStore.t('nav.pest') },
  { to: '/pesticide', label: localeStore.t('nav.pesticide') },
  { to: '/settings', label: localeStore.t('settings.title') },
])

const activePath = computed(() => route.path)

/* global __APP_VERSION__ */
const appVersion = __APP_VERSION__
</script>

<template>
  <header class="app-header">
    <span class="app-version">v{{ appVersion }}</span>
    <div class="header-top-row">
      <div>
        <p class="eyebrow">{{ localeStore.t('header.eyebrow') }}</p>
        <h1>{{ localeStore.t('header.title') }}</h1>
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

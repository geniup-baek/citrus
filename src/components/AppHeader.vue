<script setup>
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useLocaleStore } from '../stores/localeStore'

const route = useRoute()
const localeStore = useLocaleStore()

const links = computed(() => [
  { to: '/', label: localeStore.t('nav.dashboard') },
  { to: '/facilities', label: localeStore.t('nav.facilities') },
  { to: '/seedlings', label: localeStore.t('nav.seedlings') },
  { to: '/tasks', label: localeStore.t('nav.tasks') },
  { to: '/issues', label: localeStore.t('nav.issues') },
  { to: '/knowledge', label: localeStore.t('nav.knowledge') },
])

const activePath = computed(() => route.path)
</script>

<template>
  <header class="app-header">
    <div class="header-top-row">
      <div>
        <p class="eyebrow">{{ localeStore.t('header.eyebrow') }}</p>
        <h1>{{ localeStore.t('header.title') }}</h1>
      </div>

      <div class="lang-switch" :aria-label="localeStore.t('lang.switchTo')">
        <button
          class="ghost"
          type="button"
          :class="{ active: localeStore.locale === 'ko' }"
          @click="localeStore.setLocale('ko')"
        >
          {{ localeStore.t('lang.ko') }}
        </button>
        <button
          class="ghost"
          type="button"
          :class="{ active: localeStore.locale === 'en' }"
          @click="localeStore.setLocale('en')"
        >
          {{ localeStore.t('lang.en') }}
        </button>
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

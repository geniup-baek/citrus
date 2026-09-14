<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useLocaleStore } from '../stores/localeStore'
import { useFarmsStore } from '../stores/farmsStore'

const route = useRoute()
const localeStore = useLocaleStore()
const farmsStore = useFarmsStore()

const ADMIN_LINKS = [
  { to: '/resources', label: localeStore.t('nav.resources') },
  { to: '/settings', label: localeStore.t('settings.title') },
]

const links = computed(() => {
  if (farmsStore.isAdminMode) return ADMIN_LINKS
  return [
    { to: '/', label: localeStore.t('nav.dashboard') },
    { to: '/farm-status', label: localeStore.t('nav.farmStatus') },
    { to: '/pesticide-recommend', label: localeStore.t('nav.pesticideRecommend') },
    { to: '/tasks', label: localeStore.t('nav.tasks') },
    { to: '/issues', label: localeStore.t('nav.issues') },
    { to: '/resources', label: localeStore.t('nav.resources') },
    { to: '/settings', label: localeStore.t('settings.title') },
  ]
})

const activePath = computed(() => route.path)

/* global __APP_VERSION__ */
const appVersion = __APP_VERSION__

// 모바일에서 내비가 한 줄 가로 스크롤이라, 뒤쪽 탭(문제/자료/설정 등)이 활성일 때
// 화면 밖에서 시작할 수 있다 — 진입/이동 시 활성 알약이 보이도록 스크롤한다.
// block:'nearest' 가 핵심 — 'start' 를 쓰면 라우트가 바뀔 때마다 페이지 자체가
// 헤더 위치로 스크롤돼 버린다.
const navEl = ref(null)
function revealActiveLink() {
  nextTick(() => {
    navEl.value?.querySelector('.nav-link.active')
      ?.scrollIntoView({ inline: 'center', block: 'nearest' })
  })
}
onMounted(revealActiveLink)
watch(activePath, revealActiveLink)
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

    <nav ref="navEl" class="main-nav" :aria-label="localeStore.t('nav.mainNavigation')">
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

/* ⚠ 이 파일의 .header-top-row/.header-right 는 scoped(specificity 0,2,0)라
   style.css 의 전역 규칙(0,1,0)을 항상 이긴다 — 모바일 헤더 override 는
   반드시 여기(scoped)에 둬야 실제로 적용된다. */
@media (max-width: 900px) {
  .header-top-row {
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .header-right {
    flex-wrap: nowrap;
    gap: 0.5rem;
  }
  .active-farm-badge {
    gap: 0.35rem;
    min-width: 0;
  }
  .active-farm-name {
    max-width: 6.5rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .admin-badge {
    font-size: 0.75rem;
    padding: 0.15rem 0.45rem;
  }
}
</style>

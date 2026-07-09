import { createRouter, createWebHashHistory } from 'vue-router'
import { watch } from 'vue'
import DashboardView from '../views/DashboardView.vue'
import FarmStatusView from '../views/FarmStatusView.vue'
import TasksView from '../views/TasksView.vue'
import IssuesView from '../views/IssuesView.vue'
import SettingsView from '../views/SettingsView.vue'
import ResourcesView from '../views/ResourcesView.vue'
import PesticideRecommendView from '../views/PesticideRecommendView.vue'
import { useFarmsStore } from '../stores/farmsStore.js'

// 시스템 관리 모드에서는 농장별 데이터 페이지에 접근할 이유가 없다(농장 스토어가 초기화되지 않음).
const ADMIN_MODE_ALLOWED_PATHS = new Set(['/resources', '/settings'])

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: DashboardView },
    { path: '/farm-status', name: 'farm-status', component: FarmStatusView },
    { path: '/tasks', name: 'tasks', component: TasksView },
    { path: '/issues', name: 'issues', component: IssuesView },
    { path: '/resources', name: 'resources', component: ResourcesView },
    { path: '/pesticide-recommend', name: 'pesticide-recommend', component: PesticideRecommendView },
    { path: '/settings', name: 'settings', component: SettingsView },
  ],
})

router.beforeEach(async (to) => {
  const farmsStore = useFarmsStore()
  // 농장/모드 판정이 끝날 때까지 기다린 뒤 결정한다. loading 중이라고 그냥 통과시키면,
  // 예를 들어 방제이력 페이지를 보다가 "농장 전환 → 시스템 관리"로 들어와 새로고침되는
  // 경우처럼 로딩이 끝나 관리자 모드로 확정된 뒤에도 다시 검사할 새 내비게이션이 없어
  // 원래 있던(허용 안 되는) 경로가 그대로 남아있게 된다.
  if (farmsStore.loading) {
    await new Promise((resolve) => {
      const unwatch = watch(() => farmsStore.loading, (loading) => {
        if (!loading) { unwatch(); resolve() }
      })
    })
  }
  if (farmsStore.isAdminMode && !ADMIN_MODE_ALLOWED_PATHS.has(to.path)) {
    return '/resources'
  }
  return true
})

export default router

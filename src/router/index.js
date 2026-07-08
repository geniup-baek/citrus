import { createRouter, createWebHashHistory } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'
import FacilitiesView from '../views/FacilitiesView.vue'
import AncillaryView from '../views/AncillaryView.vue'
import SeedlingsView from '../views/SeedlingsView.vue'
import TasksView from '../views/TasksView.vue'
import IssuesView from '../views/IssuesView.vue'
import InventoryView from '../views/InventoryView.vue'
import KnowledgeView from '../views/KnowledgeView.vue'
import SettingsView from '../views/SettingsView.vue'
import PestView from '../views/PestView.vue'
import PesticideView from '../views/PesticideView.vue'
import PesticideRecommendView from '../views/PesticideRecommendView.vue'
import { useFarmsStore } from '../stores/farmsStore.js'

// 시스템 관리 모드에서는 농장별 데이터 페이지에 접근할 이유가 없다(농장 스토어가 초기화되지 않음).
const ADMIN_MODE_ALLOWED_PATHS = new Set(['/pest', '/pesticide', '/settings'])

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: DashboardView },
    { path: '/facilities', name: 'facilities', component: FacilitiesView },
    { path: '/ancillary', name: 'ancillary', component: AncillaryView },
    { path: '/seedlings', name: 'seedlings', component: SeedlingsView },
    { path: '/tasks', name: 'tasks', component: TasksView },
    { path: '/issues', name: 'issues', component: IssuesView },
    { path: '/inventory', name: 'inventory', component: InventoryView },
    { path: '/knowledge', name: 'knowledge', component: KnowledgeView },
    { path: '/pest', name: 'pest', component: PestView },
    { path: '/pesticide', name: 'pesticide', component: PesticideView },
    { path: '/pesticide-recommend', name: 'pesticide-recommend', component: PesticideRecommendView },
    { path: '/settings', name: 'settings', component: SettingsView },
  ],
})

router.beforeEach((to) => {
  const farmsStore = useFarmsStore()
  // 농장 목록이 아직 로딩 중이면(모드 미확정) App.vue의 게이트 화면이 어차피 RouterView를
  // 가리므로 통과시킨다. 모드가 확정된 뒤에만 관리자 모드 경로 제한을 적용한다.
  if (farmsStore.loading) return true
  if (farmsStore.isAdminMode && !ADMIN_MODE_ALLOWED_PATHS.has(to.path)) {
    return '/pest'
  }
  return true
})

export default router

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

export default router

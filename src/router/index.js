import { createRouter, createWebHashHistory } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'
import FacilitiesView from '../views/FacilitiesView.vue'
import SeedlingsView from '../views/SeedlingsView.vue'
import TasksView from '../views/TasksView.vue'
import IssuesView from '../views/IssuesView.vue'
import KnowledgeView from '../views/KnowledgeView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: DashboardView },
    { path: '/facilities', name: 'facilities', component: FacilitiesView },
    { path: '/seedlings', name: 'seedlings', component: SeedlingsView },
    { path: '/tasks', name: 'tasks', component: TasksView },
    { path: '/issues', name: 'issues', component: IssuesView },
    { path: '/knowledge', name: 'knowledge', component: KnowledgeView },
  ],
})

export default router

import { createRouter, createWebHistory } from 'vue-router'
import { authApi } from '../services/authApi'
import HomeView from '../views/AntHomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: { requiresAuth: true },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: { path: '/', query: {}, hash: '' },
    },
  ],
})

router.beforeEach(async (to) => {
  const authenticated = await authApi.isAuthenticated()
  if (to.meta.requiresAuth && !authenticated) {
    return { name: 'login' }
  }
  if (to.meta.guestOnly && authenticated) {
    return { name: 'home' }
  }
  if (to.name === 'login' && 'redirect' in to.query) {
    return { name: 'login', replace: true }
  }
})

export default router

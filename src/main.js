import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { registerSW } from 'virtual:pwa-register'
import './style.css'
import App from './App.vue'
import router from './router'
import { pullSharedCache } from './services/cache.js'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')

// 로컬 실행 환경에서 가져와 Firestore에 공유해둔 OpenAPI 전건 캐시를,
// 직접 API 호출이 불가한 배포 환경(GitHub Pages 등)에서도 쓸 수 있도록 동기화한다.
;['pesticide:all', 'pest:diseases:all', 'pest:pathogens:all', 'pest:insects:all', 'pest:prediction']
  .forEach(key => pullSharedCache(key))

registerSW({
	immediate: true,
})

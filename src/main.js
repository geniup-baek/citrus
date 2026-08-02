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
// pesticide:manual은 사용자가 직접 등록한 농약 목록, pesticide:detail-index는 상세정보 중
// 목록에 없는 값(독성·주성분)만 뽑아 압축한 색인 — 둘 다 같은 방식으로 기기 간 공유한다.
;['pesticide:all', 'pesticide:manual', 'pesticide:detail-index', 'pest:diseases:all', 'pest:pathogens:all', 'pest:insects:all', 'pest:prediction']
  .forEach(key => pullSharedCache(key))

registerSW({
	immediate: true,
})

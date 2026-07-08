<script setup>
import { ref } from 'vue'
import { useFarmsStore } from '../stores/farmsStore'

const farmsStore = useFarmsStore()

// 시스템 관리 PIN은 화면에서 설정하지 않는다 — 개발 머신의 .env.local(VITE_ADMIN_PIN)
// 또는 배포 시 GitHub Actions secret으로만 지정한다. 비어 있으면 PIN 없이 바로 진입한다.
const ADMIN_PIN = import.meta.env.VITE_ADMIN_PIN || ''

// PIN은 실제 인증이 아니라 실수로 다른 농장/관리 모드에 들어가는 것을 막는 가벼운
// 확인 절차다(이 앱은 로그인 없이 모두가 같은 Firestore를 공유한다).
const pinPromptType = ref(null) // null | 'farm' | 'admin'
const pinPromptFarm = ref(null) // pinPromptType === 'farm'일 때만 사용
const pinInput = ref('')
const pinError = ref('')

function resetPinPrompt() {
  pinPromptType.value = null
  pinPromptFarm.value = null
  pinInput.value = ''
  pinError.value = ''
}

function handleFarmClick(farm) {
  if (!farm.pin) {
    farmsStore.selectFarm(farm.id)
    return
  }
  pinPromptType.value = 'farm'
  pinPromptFarm.value = farm
  pinInput.value = ''
  pinError.value = ''
}

function handleAdminClick() {
  if (!ADMIN_PIN) {
    farmsStore.enterAdminMode()
    return
  }
  pinPromptType.value = 'admin'
  pinPromptFarm.value = null
  pinInput.value = ''
  pinError.value = ''
}

function submitPin() {
  const expected = pinPromptType.value === 'admin' ? ADMIN_PIN : pinPromptFarm.value?.pin
  if (pinInput.value.trim() === expected) {
    if (pinPromptType.value === 'admin') farmsStore.enterAdminMode()
    else farmsStore.selectFarm(pinPromptFarm.value.id)
    return
  }
  pinError.value = 'PIN이 올바르지 않습니다.'
  pinInput.value = ''
}
</script>

<template>
  <div class="farm-gate">
    <div class="card farm-gate-card">
      <template v-if="pinPromptType">
        <h2>{{ pinPromptType === 'admin' ? '시스템 관리' : pinPromptFarm.name }}</h2>
        <p class="muted">PIN이 설정되어 있습니다. PIN을 입력하세요.</p>
        <form class="stack-form" @submit.prevent="submitPin">
          <label>PIN
            <input v-model="pinInput" type="password" inputmode="numeric" autofocus placeholder="PIN 입력" />
          </label>
          <p v-if="pinError" class="settings-error">{{ pinError }}</p>
          <div class="row-actions">
            <button type="submit" :disabled="!pinInput.trim()">확인</button>
            <button class="ghost" type="button" @click="resetPinPrompt">취소</button>
          </div>
        </form>
      </template>

      <template v-else>
        <h2>농장 선택</h2>
        <p class="muted">작업할 농장을 선택하세요. 농장마다 재배동·작업·재고·방제이력이 독립적으로 관리됩니다.</p>

        <ul v-if="farmsStore.farms.length" class="list clean farm-select-grid">
          <li
            v-for="farm in farmsStore.farms"
            :key="farm.id"
            class="list-item card-like farm-select-item"
            @click="handleFarmClick(farm)"
          >
            <span class="farm-logo" :class="{ 'farm-logo-empty': !farm.logo }">
              <img v-if="farm.logo" :src="farm.logo" alt="" />
              <span v-else>{{ farm.name?.[0] ?? '?' }}</span>
            </span>
            <span class="item-title">
              {{ farm.name }}
              <span v-if="farm.pin" title="PIN이 설정된 농장">🔒</span>
            </span>
          </li>
        </ul>
        <p v-else class="muted">등록된 농장이 없습니다. 시스템 관리에서 먼저 농장을 등록해 주세요.</p>

        <div class="farm-admin-entry">
          <button class="ghost" type="button" @click="handleAdminClick">시스템 관리</button>
          <p class="muted" style="font-size: 0.78rem;">농장 등록·관리, 병해충·농약 공통 정보 갱신, 분류·항목 설정, 전체 농장 백업/복원을 관리합니다.</p>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.farm-select-grid {
  margin: 1rem 0;
  gap: 0.5rem;
}
.farm-select-item {
  display: flex;
  cursor: pointer;
  align-items: center;
  gap: 0.75rem;
}
.farm-select-item:hover {
  background: var(--surface-strong);
}
.farm-admin-entry {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--line);
}
</style>

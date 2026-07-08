<script setup>
import { useFarmsStore } from '../stores/farmsStore'

const farmsStore = useFarmsStore()
</script>

<template>
  <div class="farm-gate">
    <div class="card farm-gate-card">
      <h2>농장 선택</h2>
      <p class="muted">작업할 농장을 선택하세요. 농장마다 재배동·작업·재고·방제이력이 독립적으로 관리됩니다.</p>

      <ul v-if="farmsStore.farms.length" class="list clean farm-select-grid">
        <li
          v-for="farm in farmsStore.farms"
          :key="farm.id"
          class="list-item card-like farm-select-item"
          @click="farmsStore.selectFarm(farm.id)"
        >
          <span class="farm-logo" :class="{ 'farm-logo-empty': !farm.logo }">
            <img v-if="farm.logo" :src="farm.logo" alt="" />
            <span v-else>{{ farm.name?.[0] ?? '?' }}</span>
          </span>
          <span class="item-title">{{ farm.name }}</span>
        </li>
      </ul>
      <p v-else class="muted">등록된 농장이 없습니다. 시스템 관리에서 먼저 농장을 등록해 주세요.</p>

      <div class="farm-admin-entry">
        <button class="ghost" type="button" @click="farmsStore.enterAdminMode">시스템 관리</button>
        <p class="muted" style="font-size: 0.78rem;">농장 등록·관리, 병해충·농약 공통 정보 갱신, 분류·항목 설정, 전체 농장 백업/복원을 관리합니다.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.farm-select-grid {
  margin: 1rem 0;
  gap: 0.5rem;
}
.farm-select-item {
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

<script setup>
import { useLocaleStore } from '../stores/localeStore'
import { confirmState, resolveConfirm } from '../composables/useConfirm'

const localeStore = useLocaleStore()
</script>

<template>
  <div v-if="confirmState.open" class="confirm-overlay" @click.self="resolveConfirm(false)">
    <div class="confirm-box card" role="alertdialog" aria-modal="true">
      <h3 class="confirm-title">{{ confirmState.title || localeStore.t('confirm.title') }}</h3>
      <p class="confirm-message">{{ confirmState.message }}</p>
      <div class="row-actions confirm-actions">
        <button class="danger" type="button" @click="resolveConfirm(true)">
          {{ confirmState.confirmLabel || localeStore.t('common.delete') }}
        </button>
        <button class="ghost" type="button" @click="resolveConfirm(false)">
          {{ confirmState.cancelLabel || localeStore.t('common.cancel') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  padding: 1rem;
}
.confirm-box {
  max-width: 22rem;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.confirm-title {
  margin: 0;
  font-size: 1.05rem;
}
.confirm-message {
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.5;
  white-space: pre-wrap;
}
.confirm-actions {
  justify-content: flex-end;
}
</style>

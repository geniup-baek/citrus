<script setup>
import { computed, onMounted, ref } from 'vue'
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { useFarmStore } from '../stores/farmStore'
import { useLocaleStore } from '../stores/localeStore'
import { useTreatmentStore } from '../stores/treatmentStore'
import { useRecommendSettingsStore } from '../stores/recommendSettingsStore'
import { useAvailablePesticideStore } from '../stores/availablePesticideStore'
import { useFarmsStore } from '../stores/farmsStore'
import { useAppPolicyStore } from '../stores/appPolicyStore'
import { db, firebaseEnabled } from '../services/firebase'
import { compressImageFile } from '../utils/imageProcessing'
import { confirm } from '../composables/useConfirm'
import { exportAllFarmsBackup, isValidAllFarmsBackup, allFarmsBackupSummary, restoreAllFarmsBackup } from '../services/adminBackup.js'

const store = useFarmStore()
const localeStore = useLocaleStore()
const treatStore = useTreatmentStore()
const recSettingsStore = useRecommendSettingsStore()
const apStore = useAvailablePesticideStore()
const farmsStore = useFarmsStore()
const policyStore = useAppPolicyStore()

// ── 재배 품종(농장별) ────────────────────────────────────────────────────────
async function toggleGrownVariety(variety) {
  const list = recSettingsStore.settings.grownVarieties
  const idx = list.indexOf(variety)
  if (idx < 0) {
    list.push(variety)
    return
  }
  const usedCount = store.state.seedlings.filter((s) => s.variety === variety).length
  if (usedCount > 0) {
    const ok = await confirm({
      title: '재배 품종 제외',
      message: `"${variety}"(으)로 등록된 묘목이 ${usedCount}그루 있습니다. 재배 품종에서 제외해도 기존 묘목 데이터는 그대로 남지만, 지식 페이지·묘목 추가 목록에서는 더 이상 보이지 않습니다. 계속할까요?`,
      confirmLabel: '제외',
    })
    if (!ok) return
  }
  list.splice(idx, 1)
}

// ── 탭 ───────────────────────────────────────────────────────────────────────
// 농장 모드에서는 저장·백업 탭만 사용할 수 있다(농장/분류·항목/동작은 시스템 관리 모드 전용).
const activeTab = ref(farmsStore.isAdminMode ? 'categories' : 'storage')

// ── 농장 관리 ────────────────────────────────────────────────────────────────
const editingFarmId = ref(null)
const farmEditName = ref('')
const farmEditPin = ref('')

function startEditFarm(farm) {
  editingFarmId.value = farm.id
  farmEditName.value = farm.name
  farmEditPin.value = farm.pin || ''
}

function cancelEditFarm() {
  editingFarmId.value = null
}

async function saveFarmName(id) {
  if (!farmEditName.value.trim()) return
  await farmsStore.renameFarm(id, farmEditName.value)
  await farmsStore.updateFarmPin(id, farmEditPin.value)
  editingFarmId.value = null
}

async function handleFarmLogoChange(id, event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  const compressed = await compressImageFile(file, { maxWidth: 400, maxHeight: 400, quality: 0.85 })
  await farmsStore.updateFarmLogo(id, compressed.dataUrl)
}

async function confirmDeleteFarm(farm) {
  const ok = await confirm({
    message: `"${farm.name}" 농장을 목록에서 삭제할까요? 데이터는 지워지지 않고 '삭제된 농장'에 보관되며, 언제든 복원하거나 완전 삭제할 수 있습니다.`,
  })
  if (!ok) return
  await farmsStore.deleteFarm(farm.id)
}

async function restoreFarm(farm) {
  await farmsStore.restoreFarm(farm.id)
}

async function confirmPermanentlyDeleteFarm(farm) {
  const ok = await confirm({
    message: `"${farm.name}" 농장의 데이터를 완전히 삭제할까요? 재배동·작업·재고·방제이력을 포함한 모든 데이터가 영구히 사라지며 되돌릴 수 없습니다.`,
  })
  if (!ok) return
  await farmsStore.permanentlyDeleteFarm(farm.id)
}

const showNewFarmForm = ref(false)
const newFarmName = ref('')
const newFarmLogo = ref('')
const newFarmPin = ref('')

async function handleNewFarmLogoChange(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  const compressed = await compressImageFile(file, { maxWidth: 400, maxHeight: 400, quality: 0.85 })
  newFarmLogo.value = compressed.dataUrl
}

function removeNewFarmLogo() {
  newFarmLogo.value = ''
}

function cancelNewFarm() {
  showNewFarmForm.value = false
  newFarmName.value = ''
  newFarmLogo.value = ''
  newFarmPin.value = ''
}

async function submitNewFarm() {
  const trimmed = newFarmName.value.trim()
  if (!trimmed) return
  await farmsStore.createFarm({ name: trimmed, logo: newFarmLogo.value, pin: newFarmPin.value })
  cancelNewFarm()
}

// ── 저장공간 사용 현황 ────────────────────────────────────────────────────────
const LOCAL_STORAGE_QUOTA_BYTES = 5 * 1024 * 1024 // 브라우저마다 다르나 보수적으로 5MB 가정
const FIRESTORE_QUOTA_BYTES = 1024 * 1024 * 1024  // Firebase 무료(Spark) 플랜 저장용량 1GiB

function byteSize(value) {
  return new Blob([JSON.stringify(value ?? null)]).size
}

function formatBytes(bytes) {
  if (!bytes) return '0KB'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`
}

const localStorageBytes = ref(0)

function refreshLocalStorageUsage() {
  let bytes = 0
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    bytes += (key?.length ?? 0) + (localStorage.getItem(key)?.length ?? 0)
  }
  localStorageBytes.value = bytes
}

const localStoragePercent = computed(() =>
  Math.min(100, Math.round((localStorageBytes.value / LOCAL_STORAGE_QUOTA_BYTES) * 100)),
)

const firestoreLoading = ref(false)
const firestoreUsage = ref(null) // { total, breakdown: [{ label, bytes }] }

async function refreshFirestoreUsage() {
  if (!firebaseEnabled || !db) return
  firestoreLoading.value = true
  try {
    if (farmsStore.isAdminMode) {
      const breakdown = []
      // 삭제(휴지통 보관)된 농장도 실제로는 데이터가 그대로 남아 있어 용량을 차지하므로 함께 집계한다.
      for (const farm of [...farmsStore.farms, ...farmsStore.deletedFarms]) {
        let farmBytes = 0
        for (const docPath of [
          ['farms', farm.id, 'data', 'farmData'],
          ['farms', farm.id, 'data', 'availablePesticide'],
          ['farms', farm.id, 'data', 'recommendSettings'],
        ]) {
          const snap = await getDoc(doc(db, ...docPath))
          if (snap.exists()) farmBytes += byteSize(snap.data())
        }
        const treatSnap = await getDocs(collection(db, 'farms', farm.id, 'treatments'))
        treatSnap.forEach((d) => { farmBytes += byteSize(d.data()) })
        breakdown.push({ label: `농장: ${farm.name}${farm.deletedAt ? ' (삭제됨)' : ''}`, bytes: farmBytes })
      }

      for (const [label, docPath] of [
        ['분류·항목 설정(공통)', ['shared', 'appSettings']],
      ]) {
        const snap = await getDoc(doc(db, ...docPath))
        breakdown.push({ label, bytes: snap.exists() ? byteSize(snap.data()) : 0 })
      }
      for (const [label, colPath] of [
        ['사진(공통)', ['photos']],
        ['공공데이터 캐시(공통, 농약·병해충 정보)', ['sharedCache']],
      ]) {
        const snap = await getDocs(collection(db, ...colPath))
        let bytes = 0
        snap.forEach((d) => { bytes += byteSize(d.data()) })
        breakdown.push({ label, bytes })
      }

      firestoreUsage.value = { total: breakdown.reduce((s, b) => s + b.bytes, 0), breakdown }
      return
    }

    const farmId = farmsStore.activeFarm?.id
    if (!farmId) return
    const breakdown = []

    for (const [label, docPath] of [
      ['농장 데이터(재배동·작업·재고 등)', ['farms', farmId, 'data', 'farmData']],
      ['가용농약', ['farms', farmId, 'data', 'availablePesticide']],
      ['농약추천 정책', ['farms', farmId, 'data', 'recommendSettings']],
      ['분류·항목 설정(공통)', ['shared', 'appSettings']],
    ]) {
      const snap = await getDoc(doc(db, ...docPath))
      breakdown.push({ label, bytes: snap.exists() ? byteSize(snap.data()) : 0 })
    }

    for (const [label, colPath] of [
      ['방제이력', ['farms', farmId, 'treatments']],
      ['사진(공통)', ['photos']],
      ['공공데이터 캐시(공통, 농약·병해충 정보)', ['sharedCache']],
    ]) {
      const snap = await getDocs(collection(db, ...colPath))
      let bytes = 0
      snap.forEach((d) => { bytes += byteSize(d.data()) })
      breakdown.push({ label, bytes })
    }

    firestoreUsage.value = { total: breakdown.reduce((s, b) => s + b.bytes, 0), breakdown }
  } finally {
    firestoreLoading.value = false
  }
}

const firestorePercent = computed(() =>
  firestoreUsage.value ? Math.min(100, Math.round((firestoreUsage.value.total / FIRESTORE_QUOTA_BYTES) * 100)) : 0,
)

onMounted(refreshLocalStorageUsage)

// ── 백업 / 복원 (현재 활성 농장 + 공통 설정 기준) ─────────────────────────────
const backupMessage = ref('')
const restoreError = ref('')
const pendingRestore = ref(null)
const restoreInput = ref(null)
const restoring = ref(false)

const datasetLabels = {
  facilities: () => localeStore.t('nav.facilities'),
  ancillaries: () => localeStore.t('nav.ancillary'),
  seedlings: () => localeStore.t('nav.seedlings'),
  tasks: () => localeStore.t('nav.tasks'),
  scheduleRules: () => localeStore.t('settings.backupRules'),
  issues: () => localeStore.t('nav.issues'),
  inventory: () => '재고',
  usageGuides: () => localeStore.t('nav.usageGuides'),
  treatments: () => '방제기록',
  availablePesticides: () => '가용농약',
}

function extendedSummary(payload) {
  const base = store.backupSummary(payload)
  base.treatments = Array.isArray(payload?.data?.treatments) ? payload.data.treatments.length : 0
  const ap = payload?.data?.availablePesticide
  base.availablePesticides = Array.isArray(ap?.availableList) ? ap.availableList.length : 0
  return base
}

const currentCounts = computed(() => {
  const base = store.backupSummary(store.exportBackup())
  base.treatments = treatStore.treatments.length
  base.availablePesticides = apStore.availableList.length
  return base
})

async function exportBackup() {
  const payload = await store.exportBackupWithPhotos()
  payload.data.treatments = treatStore.treatments
  payload.data.recommendSettings = { ...recSettingsStore.settings }
  payload.data.availablePesticide = apStore.exportData()
  payload.farm = { id: farmsStore.activeFarm?.id, name: farmsStore.activeFarm?.name }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `citrus-backup-${(farmsStore.activeFarm?.name || 'farm')}-${payload.exportedAt.slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  restoreError.value = ''
  backupMessage.value = localeStore.t('settings.backupExported', { date: payload.exportedAt.slice(0, 10) })
}

async function handleRestoreFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return

  backupMessage.value = ''
  restoreError.value = ''
  pendingRestore.value = null

  try {
    const payload = JSON.parse(await file.text())
    if (!store.isValidBackup(payload)) {
      restoreError.value = localeStore.t('settings.restoreInvalid')
      return
    }
    pendingRestore.value = { payload, summary: extendedSummary(payload) }
  } catch {
    restoreError.value = localeStore.t('settings.restoreInvalid')
  }
}

function cancelRestore() {
  pendingRestore.value = null
}

async function confirmRestore() {
  if (!pendingRestore.value) return
  restoring.value = true
  try {
    const { payload } = pendingRestore.value
    await store.restoreBackup(payload)
    if (Array.isArray(payload.data?.treatments)) {
      await treatStore.replaceAllTreatments(payload.data.treatments)
    }
    if (payload.data?.recommendSettings) {
      recSettingsStore.restoreSettings(payload.data.recommendSettings)
    }
    if (payload.data?.availablePesticide) {
      apStore.restoreData(payload.data.availablePesticide)
    }
    pendingRestore.value = null
    backupMessage.value = localeStore.t('settings.restoreDone')
  } finally {
    restoring.value = false
  }
}

// ── 전체 백업/복원 (시스템 관리 모드 전용: 모든 농장 + 공통 데이터) ───────────────
const adminExporting = ref(false)
const adminBackupMessage = ref('')
const adminRestoreError = ref('')
const pendingAdminRestore = ref(null)
const adminRestoring = ref(false)
const adminRestoreInput = ref(null)

async function exportAllBackup() {
  adminExporting.value = true
  adminBackupMessage.value = ''
  adminRestoreError.value = ''
  try {
    const payload = await exportAllFarmsBackup()
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `citrus-backup-all-${payload.exportedAt.slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    adminBackupMessage.value = localeStore.t('settings.backupExported', { date: payload.exportedAt.slice(0, 10) })
  } finally {
    adminExporting.value = false
  }
}

async function handleAdminRestoreFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return

  adminBackupMessage.value = ''
  adminRestoreError.value = ''
  pendingAdminRestore.value = null

  try {
    const payload = JSON.parse(await file.text())
    if (!isValidAllFarmsBackup(payload)) {
      adminRestoreError.value = localeStore.t('settings.restoreInvalid')
      return
    }
    pendingAdminRestore.value = { payload, summary: allFarmsBackupSummary(payload) }
  } catch {
    adminRestoreError.value = localeStore.t('settings.restoreInvalid')
  }
}

function cancelAdminRestore() {
  pendingAdminRestore.value = null
}

async function confirmAdminRestore() {
  if (!pendingAdminRestore.value) return
  adminRestoring.value = true
  try {
    await restoreAllFarmsBackup(pendingAdminRestore.value.payload)
    pendingAdminRestore.value = null
    adminBackupMessage.value = localeStore.t('settings.restoreDone')
  } finally {
    adminRestoring.value = false
  }
}

// ── 분류·항목 설정(공통) ────────────────────────────────────────────────────
const inputs = ref({
  ancillaryTypes: '',
  equipmentTypes: '',
  seedlingVarieties: '',
  rootstockTypes: '',
  taskCategories: '',
})

const errors = ref({
  ancillaryTypes: '',
  equipmentTypes: '',
  seedlingVarieties: '',
  rootstockTypes: '',
  taskCategories: '',
  pesticideTypes: '',
})

const groups = [
  { key: 'ancillaryTypes',    label: () => localeStore.t('settings.ancillaryTypes'),    hint: () => localeStore.t('settings.ancillaryHint') },
  { key: 'equipmentTypes',    label: () => localeStore.t('settings.equipmentTypes'),    hint: () => localeStore.t('settings.equipmentHint') },
  { key: 'seedlingVarieties', label: () => localeStore.t('settings.seedlingVarieties'), hint: () => localeStore.t('settings.seedlingHint') },
  { key: 'rootstockTypes',    label: () => localeStore.t('settings.rootstockTypes'),    hint: () => localeStore.t('settings.rootstockHint') },
  { key: 'pesticideTypes',    label: () => localeStore.t('settings.pesticideTypes'),    hint: () => localeStore.t('settings.pesticideHint'), isPair: true },
  { key: 'taskCategories',    label: () => localeStore.t('settings.taskCategories'),    hint: () => localeStore.t('settings.taskCategoryHint') },
]

// 농약 종류 전용 pair 입력
const pesticideTypeInputs = ref({ name: '', abbr: '' })

function itemName(item) { return typeof item === 'string' ? item : item.name }
function itemAbbr(item) { return typeof item === 'string' ? '' : (item.abbr || '') }

function moved(arr, i, dir) {
  const j = i + dir
  if (j < 0 || j >= arr.length) return arr
  const res = [...arr]
  const tmp = res[i]
  res[i] = res[j]
  res[j] = tmp
  return res
}

function moveOption(key, i, dir) {
  const current = store.state.appSettings[key] || []
  store.updateAppSettings({ [key]: moved(current, i, dir) })
}

function addOption(key) {
  const val = inputs.value[key].trim()
  if (!val) return
  const current = store.state.appSettings[key] || []
  if (current.includes(val)) {
    errors.value[key] = localeStore.t('settings.duplicateError')
    return
  }
  store.updateAppSettings({ [key]: [...current, val] })
  inputs.value[key] = ''
  errors.value[key] = ''
}

function addPesticideType() {
  const name = pesticideTypeInputs.value.name.trim()
  if (!name) return
  const abbr = pesticideTypeInputs.value.abbr.trim()
  const current = store.state.appSettings.pesticideTypes || []
  if (current.some(v => itemName(v) === name)) {
    errors.value.pesticideTypes = localeStore.t('settings.duplicateError')
    return
  }
  store.updateAppSettings({ pesticideTypes: [...current, { name, abbr }] })
  pesticideTypeInputs.value = { name: '', abbr: '' }
  errors.value.pesticideTypes = ''
}

function removeOption(key, item) {
  const current = store.state.appSettings[key] || []
  store.updateAppSettings({ [key]: current.filter((v) => itemName(v) !== itemName(item)) })
}

function onInput(key) {
  if (errors.value[key]) errors.value[key] = ''
}

const editingItem = ref(null)
const editInputs = ref({ text: '', abbr: '' })

function startEdit(key, item, i) {
  editingItem.value = { key, i }
  editInputs.value = { text: itemName(item), abbr: itemAbbr(item) }
}

function cancelEdit() {
  editingItem.value = null
}

function saveEdit(key, i, isPair) {
  const newName = editInputs.value.text.trim()
  if (!newName) return
  const current = store.state.appSettings[key] || []
  if (current.some((v, j) => j !== i && itemName(v) === newName)) return
  const updated = current.map((v, j) => {
    if (j !== i) return v
    return isPair ? { name: newName, abbr: editInputs.value.abbr.trim() } : newName
  })
  store.updateAppSettings({ [key]: updated })
  editingItem.value = null
}
</script>

<template>
  <section class="page-grid">
    <div class="card">
      <h2>{{ localeStore.t('settings.title') }}</h2>

      <div class="tab-bar">
        <template v-if="farmsStore.isAdminMode">
          <button class="tab-btn" :class="{ active: activeTab === 'farm' }" type="button" @click="activeTab = 'farm'">농장</button>
          <button class="tab-btn" :class="{ active: activeTab === 'categories' }" type="button" @click="activeTab = 'categories'">분류·항목</button>
        </template>
        <button class="tab-btn" :class="{ active: activeTab === 'behavior' }" type="button" @click="activeTab = 'behavior'">동작</button>
        <button class="tab-btn" :class="{ active: activeTab === 'storage' }" type="button" @click="activeTab = 'storage'">저장·백업</button>
      </div>

      <!-- ═══ 농장 ═══════════════════════════════════════════════════════════ -->
      <template v-if="farmsStore.isAdminMode && activeTab === 'farm'">
        <div class="sub-card">
          <div class="settings-group-head">
            <h3>농장 관리</h3>
            <span class="pill">{{ farmsStore.farms.length }}개</span>
          </div>
          <p class="muted settings-group-hint">
            농장마다 재배동·시설장비·묘목·작업·문제·재고·방제이력·가용농약이 독립적으로 관리됩니다.
            병해충·농약 정보와 분류·항목 설정은 모든 농장이 공유합니다.
          </p>

          <ul class="list clean">
            <li v-for="farm in farmsStore.farms" :key="farm.id" class="list-item settings-item farm-manage-item">
              <template v-if="editingFarmId === farm.id">
                <input v-model="farmEditName" class="settings-edit-input" type="text" placeholder="농장 이름" @keydown.enter.prevent="saveFarmName(farm.id)" @keydown.escape.prevent="cancelEditFarm" />
                <input v-model="farmEditPin" class="settings-edit-input" type="text" inputmode="numeric" placeholder="PIN (선택, 비우면 해제)" style="max-width: 11rem;" @keydown.enter.prevent="saveFarmName(farm.id)" @keydown.escape.prevent="cancelEditFarm" />
                <label class="ghost compact-btn">
                  로고 변경
                  <input accept="image/*" type="file" hidden @change="(e) => handleFarmLogoChange(farm.id, e)" />
                </label>
                <div class="row-actions">
                  <button type="button" :disabled="!farmEditName.trim()" @click="saveFarmName(farm.id)">저장</button>
                  <button class="ghost" type="button" @click="cancelEditFarm">취소</button>
                </div>
              </template>
              <template v-else>
                <span class="farm-logo-mini" :class="{ 'farm-logo-mini-empty': !farm.logo }">
                  <img v-if="farm.logo" :src="farm.logo" alt="" />
                  <span v-else>{{ farm.name?.[0] ?? '?' }}</span>
                </span>
                <span class="settings-item-name">
                  {{ farm.name }}
                  <span v-if="farmsStore.activeFarm?.id === farm.id" class="pill">사용 중</span>
                  <span v-if="farm.pin" class="pill" title="PIN이 설정된 농장">🔒 PIN</span>
                </span>
                <div class="row-actions settings-item-actions">
                  <button class="ghost icon-btn" type="button" title="수정" aria-label="수정" @click="startEditFarm(farm)">✎</button>
                  <button
                    class="danger icon-btn"
                    type="button"
                    title="삭제"
                    aria-label="삭제"
                    :disabled="farmsStore.activeFarm?.id === farm.id || farmsStore.farms.length <= 1"
                    @click="confirmDeleteFarm(farm)"
                  >✕</button>
                </div>
              </template>
            </li>
          </ul>

          <template v-if="showNewFarmForm">
            <form class="stack-form" style="margin-top: 0.75rem;" @submit.prevent="submitNewFarm">
              <label>농장 이름
                <input v-model="newFarmName" type="text" required placeholder="예: 서귀포 농장" />
              </label>
              <label>로고 (선택)
                <input accept="image/*" type="file" @change="handleNewFarmLogoChange" />
              </label>
              <div v-if="newFarmLogo" class="farm-logo-preview">
                <img :src="newFarmLogo" alt="" />
                <button type="button" class="ghost" @click="removeNewFarmLogo">제거</button>
              </div>
              <label>PIN (선택)
                <input v-model="newFarmPin" type="text" inputmode="numeric" placeholder="설정하면 농장 선택 시 PIN 입력이 필요합니다" />
              </label>
              <div class="row-actions">
                <button type="submit" :disabled="!newFarmName.trim()">추가</button>
                <button class="ghost" type="button" @click="cancelNewFarm">취소</button>
              </div>
            </form>
          </template>
          <button v-else type="button" style="margin-top: 0.5rem;" @click="showNewFarmForm = true">새 농장 추가</button>

          <p style="margin-top: 0.75rem;">
            <button class="ghost" type="button" @click="farmsStore.exitToSelector">관리 모드 종료 (농장 선택 화면으로)</button>
          </p>
        </div>

        <div v-if="farmsStore.deletedFarms.length" class="sub-card" style="margin-top: 1rem;">
          <div class="settings-group-head">
            <h3>삭제된 농장</h3>
            <span class="pill">{{ farmsStore.deletedFarms.length }}개</span>
          </div>
          <p class="muted settings-group-hint">
            목록에서 삭제된 농장입니다. 데이터는 그대로 남아 있어 복원하면 바로 다시 사용할 수 있습니다.
            "완전 삭제"를 누르면 해당 농장의 모든 데이터가 되돌릴 수 없이 사라집니다.
          </p>

          <ul class="list clean">
            <li v-for="farm in farmsStore.deletedFarms" :key="farm.id" class="list-item settings-item farm-manage-item">
              <span class="farm-logo-mini" :class="{ 'farm-logo-mini-empty': !farm.logo }">
                <img v-if="farm.logo" :src="farm.logo" alt="" />
                <span v-else>{{ farm.name?.[0] ?? '?' }}</span>
              </span>
              <span class="settings-item-name">{{ farm.name }}</span>
              <div class="row-actions settings-item-actions">
                <button class="ghost compact-btn" type="button" @click="restoreFarm(farm)">복원</button>
                <button class="danger compact-btn" type="button" @click="confirmPermanentlyDeleteFarm(farm)">완전 삭제</button>
              </div>
            </li>
          </ul>
        </div>
      </template>

      <!-- ═══ 분류·항목 ══════════════════════════════════════════════════════ -->
      <template v-if="farmsStore.isAdminMode && activeTab === 'categories'">
        <p class="muted settings-subtitle">{{ localeStore.t('settings.subtitle') }}</p>
        <div class="settings-groups">
          <div v-for="group in groups" :key="group.key" class="sub-card settings-group">
            <div class="settings-group-head">
              <h3>{{ group.label() }}</h3>
              <span class="pill">{{ localeStore.t('settings.itemCount', { count: store.state.appSettings[group.key]?.length || 0 }) }}</span>
            </div>
            <p class="muted settings-group-hint">{{ group.hint() }}</p>

            <ul class="list clean compact">
              <li
                v-for="(item, i) in store.state.appSettings[group.key]"
                :key="group.isPair ? itemName(item) : item"
                class="list-item settings-item"
                :class="{ 'settings-item-editing': editingItem?.key === group.key && editingItem?.i === i }"
              >
                <template v-if="editingItem?.key === group.key && editingItem?.i === i">
                  <input
                    v-model="editInputs.text"
                    class="settings-edit-input"
                    type="text"
                    @keydown.enter.prevent="saveEdit(group.key, i, group.isPair)"
                    @keydown.escape.prevent="cancelEdit"
                  />
                  <input
                    v-if="group.isPair"
                    v-model="editInputs.abbr"
                    class="settings-abbr-input"
                    type="text"
                    placeholder="약어"
                    @keydown.enter.prevent="saveEdit(group.key, i, group.isPair)"
                    @keydown.escape.prevent="cancelEdit"
                  />
                  <div class="row-actions">
                    <button type="button" :disabled="!editInputs.text.trim()" @click="saveEdit(group.key, i, group.isPair)">저장</button>
                    <button class="ghost" type="button" @click="cancelEdit">취소</button>
                  </div>
                </template>
                <template v-else>
                  <span v-if="group.isPair" class="settings-item-name">
                    {{ itemName(item) }}<span v-if="itemAbbr(item)" class="settings-item-abbr">{{ itemAbbr(item) }}</span>
                  </span>
                  <span v-else class="settings-item-name">{{ item }}</span>
                  <div class="row-actions settings-item-actions">
                    <button
                      class="ghost icon-btn"
                      type="button"
                      :disabled="i === 0"
                      :title="localeStore.t('common.moveUp')"
                      :aria-label="localeStore.t('common.moveUp')"
                      @click="moveOption(group.key, i, -1)"
                    >↑</button>
                    <button
                      class="ghost icon-btn"
                      type="button"
                      :disabled="i === store.state.appSettings[group.key].length - 1"
                      :title="localeStore.t('common.moveDown')"
                      :aria-label="localeStore.t('common.moveDown')"
                      @click="moveOption(group.key, i, 1)"
                    >↓</button>
                    <button
                      class="ghost icon-btn"
                      type="button"
                      :title="localeStore.t('common.edit')"
                      :aria-label="localeStore.t('common.edit')"
                      @click="startEdit(group.key, item, i)"
                    >✎</button>
                    <button
                      class="danger icon-btn"
                      type="button"
                      :title="localeStore.t('common.delete')"
                      :aria-label="localeStore.t('common.delete')"
                      @click="removeOption(group.key, item)"
                    >✕</button>
                  </div>
                </template>
              </li>
              <li v-if="!store.state.appSettings[group.key]?.length" class="muted">
                {{ localeStore.t('settings.noOptions') }}
              </li>
            </ul>

            <template v-if="group.isPair">
              <div class="settings-add-row settings-add-pair">
                <input
                  v-model="pesticideTypeInputs.name"
                  type="text"
                  placeholder="표시명 (예: 살충제)"
                  @input="onInput('pesticideTypes')"
                  @keydown.enter.prevent="addPesticideType"
                />
                <input
                  v-model="pesticideTypeInputs.abbr"
                  type="text"
                  placeholder="약어 (예: 살충)"
                  class="settings-abbr-input"
                  @keydown.enter.prevent="addPesticideType"
                />
                <button type="button" :disabled="!pesticideTypeInputs.name.trim()" @click="addPesticideType">{{ localeStore.t('settings.add') }}</button>
              </div>
            </template>
            <template v-else>
              <div class="row-actions settings-add-row">
                <input
                  v-model="inputs[group.key]"
                  type="text"
                  :placeholder="localeStore.t('settings.addPlaceholder')"
                  @input="onInput(group.key)"
                  @keydown.enter.prevent="addOption(group.key)"
                />
                <button type="button" :disabled="!inputs[group.key].trim()" @click="addOption(group.key)">{{ localeStore.t('settings.add') }}</button>
              </div>
            </template>
            <p v-if="errors[group.key]" class="settings-error">{{ errors[group.key] }}</p>
          </div>
        </div>
      </template>

      <!-- ═══ 동작 ═══════════════════════════════════════════════════════════ -->
      <template v-if="activeTab === 'behavior'">
        <!-- 시스템 관리 모드: 기기/앱 전역 공통 동작 -->
        <template v-if="farmsStore.isAdminMode">
          <div class="sub-card">
            <div class="settings-group-head">
              <h3>공공데이터 상세정보 가져오기</h3>
            </div>
            <p class="muted settings-group-hint">농약검색 페이지의 "상세정보 전체 가져오기" 실행 방식을 설정합니다.</p>
            <div class="inline-filters">
              <button
                type="button"
                :class="{ ghost: !recSettingsStore.settings.skipCachedPesticideDetails }"
                @click="recSettingsStore.settings.skipCachedPesticideDetails = true"
              >이미 가져온 항목 건너뛰기</button>
              <button
                type="button"
                :class="{ ghost: recSettingsStore.settings.skipCachedPesticideDetails }"
                @click="recSettingsStore.settings.skipCachedPesticideDetails = false"
              >전체 새로 가져오기</button>
            </div>
            <p class="muted text-sm" style="margin-top: 0.5rem;">
              "전체 새로 가져오기"는 매번 API를 다시 다 호출하므로 시간이 오래 걸립니다. 데이터 구조가 바뀌었거나 잘못 저장된 캐시를 고쳐야 할 때만 선택하세요.
              이 설정은 <strong>이 기기에만 적용</strong>됩니다.
            </p>
          </div>

          <div class="sub-card">
            <div class="settings-group-head">
              <h3>PDF 출력</h3>
            </div>
            <p class="muted settings-group-hint">비료·농약재고 현황의 "PDF 출력" 버튼 동작 방식을 설정합니다.</p>
            <div class="inline-filters">
              <button
                type="button"
                :class="{ ghost: policyStore.policy.autoOpenPrintDialog }"
                @click="policyStore.policy.autoOpenPrintDialog = false"
              >보고서만 열기</button>
              <button
                type="button"
                :class="{ ghost: !policyStore.policy.autoOpenPrintDialog }"
                @click="policyStore.policy.autoOpenPrintDialog = true"
              >인쇄 대화상자 자동으로 열기</button>
            </div>
            <p class="muted text-sm" style="margin-top: 0.5rem;">
              "보고서만 열기"는 보고서 화면만 새 창으로 열고 인쇄 대화상자는 자동으로 띄우지 않습니다(필요할 때 직접 Ctrl+P). "인쇄 대화상자 자동으로 열기"는 새 창을 열자마자 바로 인쇄 대화상자를 띄웁니다.
            </p>
          </div>

          <div class="sub-card">
            <div class="settings-group-head">
              <h3>농약 직접등록 권한</h3>
            </div>
            <p class="muted settings-group-hint">자료 &gt; 농약의 "직접 추가"(공공데이터에 없는 농약 등록)를 누가 쓸 수 있게 할지 설정합니다.</p>
            <div class="inline-filters">
              <button
                type="button"
                :class="{ ghost: policyStore.policy.allowManualPesticideForAll }"
                @click="policyStore.policy.allowManualPesticideForAll = false"
              >시스템 관리 모드만</button>
              <button
                type="button"
                :class="{ ghost: !policyStore.policy.allowManualPesticideForAll }"
                @click="policyStore.policy.allowManualPesticideForAll = true"
              >누구나</button>
            </div>
            <p class="muted text-sm" style="margin-top: 0.5rem;">
              직접등록한 농약은 모든 농장이 함께 쓰는 자료입니다. "시스템 관리 모드만"으로 두면 농장 모드에서는 추가·수정·삭제 버튼이 보이지 않습니다(등록된 농약 검색·연결은 그대로 됩니다).
            </p>
          </div>

          <div class="sub-card">
            <div class="settings-group-head">
              <h3>초기화 기능</h3>
            </div>
            <p class="muted settings-group-hint">
              방제이력·농약재고·가용농약·재배동·시설장비·묘목·비료재고·작업·문제의 "초기화" 기능을 사용할지 설정합니다.
            </p>
            <div class="inline-filters">
              <button
                type="button"
                :class="{ ghost: policyStore.policy.enableResetFeature }"
                @click="policyStore.policy.enableResetFeature = false"
              >사용 안 함</button>
              <button
                type="button"
                :class="{ ghost: !policyStore.policy.enableResetFeature }"
                @click="policyStore.policy.enableResetFeature = true"
              >사용</button>
            </div>
            <p class="muted text-sm" style="margin-top: 0.5rem;">
              "초기화"는 해당 목록을 통째로 삭제하며 되돌릴 수 없습니다. "사용 안 함"이면 농장 설정의 "초기화 버튼 표시" 항목도 감춰지고 초기화 버튼은 어느 농장에서도 나타나지 않습니다.
            </p>
          </div>
        </template>

        <!-- 농장 모드: 이 농장에만 적용되는 정책 -->
        <template v-else>
          <div class="sub-card">
            <div class="settings-group-head">
              <h3>방제이력 전체 재연결</h3>
            </div>
            <p class="muted settings-group-hint">방제이력 탭의 "전체 재연결" 실행 방식을 설정합니다. (현재 농장에만 적용됩니다)</p>
            <div class="inline-filters">
              <button
                type="button"
                :class="{ ghost: recSettingsStore.settings.overwriteLinkedTreatments }"
                @click="recSettingsStore.settings.overwriteLinkedTreatments = false"
              >미연결만 연결</button>
              <button
                type="button"
                :class="{ ghost: !recSettingsStore.settings.overwriteLinkedTreatments }"
                @click="recSettingsStore.settings.overwriteLinkedTreatments = true"
              >이미 연결된 이력도 덮어쓰기</button>
            </div>
            <p class="muted text-sm" style="margin-top: 0.5rem;">
              "미연결만 연결"은 아직 연결 안 된 이력만 연결합니다. "이미 연결된 이력도 덮어쓰기"는 이미 연결된 이력도 최신 정보로 다시 덮어씁니다.
            </p>
          </div>

          <div class="sub-card">
            <div class="settings-group-head">
              <h3>붙여넣기 일괄추가 방식</h3>
            </div>
            <p class="muted settings-group-hint">
              방제이력·농약재고·가용농약의 "붙여넣기 일괄추가" 실행 방식을 설정합니다. (현재 농장에만 적용됩니다)
            </p>
            <div class="inline-filters">
              <button
                type="button"
                :class="{ ghost: recSettingsStore.settings.bulkImportMode !== 'append' }"
                @click="recSettingsStore.settings.bulkImportMode = 'append'"
              >기존 목록에 추가</button>
              <button
                type="button"
                :class="{ ghost: recSettingsStore.settings.bulkImportMode !== 'replace' }"
                @click="recSettingsStore.settings.bulkImportMode = 'replace'"
              >전체 새로 작성</button>
            </div>
            <p class="muted text-sm" style="margin-top: 0.5rem;">
              "기존 목록에 추가"는 붙여넣은 항목만 더합니다. "전체 새로 작성"은 붙여넣기 전 기존 목록(방제이력·농약재고는 전체 삭제, 가용농약은 구입가능농약 텍스트 전체)을 지우고 붙여넣은 내용으로 다시 만듭니다 — 되돌릴 수 없으니 주의하세요.
            </p>
          </div>

          <div class="sub-card">
            <div class="settings-group-head">
              <h3>재배 품종</h3>
            </div>
            <p class="muted settings-group-hint">
              이 농장에서 실제로 재배하는 묘목 품종을 선택합니다. (현재 농장에만 적용됩니다)
            </p>
            <div class="inline-filters">
              <button
                v-for="v in (store.state.appSettings?.seedlingVarieties ?? [])"
                :key="v"
                type="button"
                :class="{ ghost: !recSettingsStore.settings.grownVarieties.includes(v) }"
                @click="toggleGrownVariety(v)"
              >{{ v }}</button>
            </div>
            <p class="muted text-sm" style="margin-top: 0.5rem;">
              선택한 품종만 지식 페이지의 "품종 특성"과 묘목 추가 시 품종 목록에 표시됩니다. 아무것도 선택하지 않으면 전체 품종이 제한 없이 표시됩니다. 이미 등록된 묘목의 품종을 제외해도 그 묘목 데이터는 그대로 남습니다.
            </p>
          </div>

          <!-- 초기화 기능은 시스템 관리 모드에서 켜 둔 경우에만 농장별로 표시 여부를 고를 수 있다. -->
          <div v-if="policyStore.policy.enableResetFeature" class="sub-card">
            <div class="settings-group-head">
              <h3>초기화 버튼 표시</h3>
            </div>
            <p class="muted settings-group-hint">
              방제이력·농약재고·가용농약·재배동·시설장비·묘목·비료재고·작업·문제 편집모드에 "초기화" 버튼을 표시할지 설정합니다. (현재 농장에만 적용됩니다)
            </p>
            <div class="inline-filters">
              <button
                type="button"
                :class="{ ghost: recSettingsStore.settings.showResetButtons }"
                @click="recSettingsStore.settings.showResetButtons = false"
              >표시 안 함</button>
              <button
                type="button"
                :class="{ ghost: !recSettingsStore.settings.showResetButtons }"
                @click="recSettingsStore.settings.showResetButtons = true"
              >표시</button>
            </div>
            <p class="muted text-sm" style="margin-top: 0.5rem;">
              "초기화"는 이 농장의 해당 목록을 통째로 삭제하며 되돌릴 수 없습니다. 평소에는 "표시 안 함"으로 두고, 데이터를 새로 만들어야 할 때만 잠시 켜세요.
            </p>
          </div>
        </template>
      </template>

      <!-- ═══ 저장·백업 ══════════════════════════════════════════════════════ -->
      <template v-if="activeTab === 'storage'">
        <div class="sub-card settings-storage">
          <div class="settings-group-head">
            <h3>저장공간 사용 현황</h3>
          </div>
          <p class="muted settings-group-hint">
            이 기기의 로컬 저장소와 Firebase 저장용량을 대략적으로 확인합니다
            ({{ farmsStore.isAdminMode ? '전체 농장 + 공통 데이터 기준' : '현재 농장 기준' }}).
          </p>

          <div class="storage-block">
            <div class="storage-block-head">
              <span>로컬 저장소 (이 기기)</span>
              <span class="muted">{{ formatBytes(localStorageBytes) }} 사용 중 (추정치)</span>
            </div>
            <div class="storage-bar"><div class="storage-bar-fill" :style="{ width: localStoragePercent + '%' }"></div></div>
          </div>

          <div v-if="firebaseEnabled" class="storage-block">
            <div class="storage-block-head">
              <span>Firebase 저장용량 (팀 공유)</span>
              <button class="ghost compact-btn" type="button" :disabled="firestoreLoading" @click="refreshFirestoreUsage">
                {{ firestoreLoading ? '확인 중...' : (firestoreUsage ? '새로고침' : '확인') }}
              </button>
            </div>
            <template v-if="firestoreUsage">
              <div class="storage-bar"><div class="storage-bar-fill" :style="{ width: firestorePercent + '%' }"></div></div>
              <p class="muted text-sm" style="margin: 0.3rem 0 0.5rem;">
                {{ formatBytes(firestoreUsage.total) }} / 1GiB 사용 중 (무료 플랜 기준, 추정치)
              </p>
              <ul class="list clean compact storage-breakdown">
                <li v-for="b in firestoreUsage.breakdown" :key="b.label" class="item-meta">
                  {{ b.label }} <span class="muted">{{ formatBytes(b.bytes) }}</span>
                </li>
              </ul>
            </template>
            <p v-else class="muted text-sm">확인 버튼을 누르면 조회합니다 (사진·캐시 데이터가 많으면 몇 초 걸릴 수 있습니다).</p>
          </div>
        </div>

        <!-- 시스템 관리 모드: 전체 농장 + 공통 데이터 백업/복원 -->
        <div v-if="farmsStore.isAdminMode" class="sub-card settings-backup">
          <div class="settings-group-head">
            <h3>전체 백업 (모든 농장 + 공통 데이터)</h3>
          </div>
          <p class="muted settings-group-hint">
            등록된 모든 농장의 데이터와 분류·항목 설정을 한 파일로 백업/복원합니다. 사진 본문은 포함되지 않습니다(농장별 백업에서 개별적으로 백업하세요).
          </p>

          <div class="row-actions settings-backup-actions">
            <button type="button" :disabled="adminExporting" @click="exportAllBackup">{{ adminExporting ? '내보내는 중...' : '전체 백업' }}</button>
            <button class="ghost" type="button" @click="adminRestoreInput?.click()">전체 복원</button>
            <input ref="adminRestoreInput" accept="application/json,.json" type="file" hidden @change="handleAdminRestoreFile" />
          </div>

          <p v-if="adminBackupMessage" class="muted settings-backup-msg">{{ adminBackupMessage }}</p>
          <p v-if="adminRestoreError" class="settings-error">{{ adminRestoreError }}</p>

          <div v-if="pendingAdminRestore" class="restore-preview">
            <p class="restore-preview-title">복원 대상 미리보기</p>
            <div class="backup-counts">
              <span class="pill">농장 {{ pendingAdminRestore.summary.farmCount }}개</span>
              <span v-for="f in pendingAdminRestore.summary.farms" :key="f.id" class="pill">{{ f.name }} · 방제기록 {{ f.treatments }}</span>
              <span v-if="pendingAdminRestore.summary.hasAppSettings" class="pill">{{ localeStore.t('settings.backupSettingsIncluded') }}</span>
              <span v-if="pendingAdminRestore.summary.manualPesticides" class="pill">직접등록 농약 {{ pendingAdminRestore.summary.manualPesticides }}</span>
            </div>
            <p class="settings-error">{{ localeStore.t('settings.restoreWarning') }}</p>
            <div class="row-actions">
              <button class="danger" type="button" :disabled="adminRestoring" @click="confirmAdminRestore">{{ adminRestoring ? '복원 중...' : localeStore.t('settings.restoreRun') }}</button>
              <button class="ghost" type="button" @click="cancelAdminRestore">{{ localeStore.t('common.cancel') }}</button>
            </div>
          </div>
        </div>

        <!-- 농장 모드: 현재 농장 데이터만 백업/복원 -->
        <div v-else class="sub-card settings-backup">
          <div class="settings-group-head">
            <h3>{{ localeStore.t('settings.backupTitle') }}</h3>
          </div>
          <p class="muted settings-group-hint">{{ localeStore.t('settings.backupDesc') }} (현재 농장: {{ farmsStore.activeFarm?.name }})</p>

          <div class="backup-counts">
            <span v-for="(labelFn, key) in datasetLabels" :key="key" class="pill">
              {{ localeStore.t('settings.backupCount', { label: labelFn(), count: currentCounts[key] }) }}
            </span>
            <span v-if="currentCounts.settings" class="pill">{{ localeStore.t('settings.backupSettingsIncluded') }}</span>
          </div>

          <div class="row-actions settings-backup-actions">
            <button type="button" @click="exportBackup">{{ localeStore.t('settings.backupExport') }}</button>
            <button class="ghost" type="button" @click="restoreInput?.click()">{{ localeStore.t('settings.backupImport') }}</button>
            <input ref="restoreInput" accept="application/json,.json" type="file" hidden @change="handleRestoreFile" />
          </div>

          <p v-if="backupMessage" class="muted settings-backup-msg">{{ backupMessage }}</p>
          <p v-if="restoreError" class="settings-error">{{ restoreError }}</p>

          <div v-if="pendingRestore" class="restore-preview">
            <p class="restore-preview-title">{{ localeStore.t('settings.restorePreviewTitle') }}</p>
            <div class="backup-counts">
              <span v-for="(labelFn, key) in datasetLabels" :key="key" class="pill">
                {{ localeStore.t('settings.backupCount', { label: labelFn(), count: pendingRestore.summary[key] }) }}
              </span>
              <span v-if="pendingRestore.summary.photos" class="pill">{{ localeStore.t('settings.backupPhotos', { count: pendingRestore.summary.photos }) }}</span>
              <span v-if="pendingRestore.summary.settings" class="pill">{{ localeStore.t('settings.backupSettingsIncluded') }}</span>
            </div>
            <p class="settings-error">{{ localeStore.t('settings.restoreWarning') }}</p>
            <div class="row-actions">
              <button class="danger" type="button" :disabled="restoring" @click="confirmRestore">{{ restoring ? '복원 중...' : localeStore.t('settings.restoreRun') }}</button>
              <button class="ghost" type="button" :disabled="restoring" @click="cancelRestore">{{ localeStore.t('common.cancel') }}</button>
            </div>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>

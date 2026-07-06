<script setup>
import { computed, nextTick, reactive, ref } from 'vue'
import { format } from 'date-fns'
import { useFarmStore } from '../stores/farmStore'
import { useLocaleStore } from '../stores/localeStore'
import { compressImageFile } from '../utils/imageProcessing'
import { confirm } from '../composables/useConfirm'
import { useIsMobile } from '../composables/useIsMobile'

const store = useFarmStore()
const localeStore = useLocaleStore()
const editingId = ref('')
const showForm = ref(false)

const { isMobile } = useIsMobile()
const formOpen = ref(false) // 폼(추가/편집) 표시 여부 — 토글로 닫으면 추가 폼도 숨긴다
// 편집 대상이 현재 목록에 보일 때만 그 항목 슬롯으로, 아니면 상단 호스트로(텔레포트 대상 null 방지)
const formTarget = computed(() =>
  editingId.value && displayedSeedlings.value.some((s) => s.id === editingId.value)
    ? `#seed-form-slot-${editingId.value}`
    : '#seed-form-top',
)

// ── 성장 기록 인라인 패널 ────────────────────────────────────────────────────
const expandedId = ref('')
const logNote = ref('')
const logPhotoPreviews = ref([])
const logCompressionReport = ref('')
const lightboxPhoto = ref(null)

// 성장 기록 편집
const editingLogId = ref('')
const editLogNote = ref('')
const editLogPhotos = ref([])
const editLogNewPreviews = ref([])
const editLogCompressionReport = ref('')

const varieties = computed(() => store.state.appSettings?.seedlingVarieties ?? ['한라봉', '카라향'])

const sortBy = ref('greenhouse')
const sortDir = ref('asc')
const filterGreenhouseId = ref('')
const filterVariety = ref('')

const displayedSeedlings = computed(() => {
  let list = [...store.state.seedlings]

  if (filterGreenhouseId.value) {
    list = list.filter((s) => s.greenhouseId === filterGreenhouseId.value)
  }
  if (filterVariety.value) {
    list = list.filter((s) => s.variety === filterVariety.value)
  }

  const dir = sortDir.value === 'asc' ? 1 : -1

  list.sort((a, b) => {
    if (sortBy.value === 'greenhouse') {
      // 재배동 → 열 → 구역(A/B/C) 순으로 정렬
      const byHouse = greenhouseName(a.greenhouseId).localeCompare(greenhouseName(b.greenhouseId))
      if (byHouse !== 0) return dir * byHouse
      const byRow = (Number(a.positionRow) || 0) - (Number(b.positionRow) || 0)
      if (byRow !== 0) return dir * byRow
      return dir * String(a.positionCol || '').localeCompare(String(b.positionCol || ''))
    }
    if (sortBy.value === 'variety') {
      return dir * a.variety.localeCompare(b.variety)
    }
    return dir * a.plantedAt.localeCompare(b.plantedAt)
  })

  return list
})

const rowOptions = Array.from({ length: 30 }, (_, i) => i + 1)
const colOptions = ['A', 'B', 'C']

const form = reactive({
  id: '',
  greenhouseId: '',
  positionRow: '',
  positionCol: '',
  variety: '',
  plantedAt: '',
  rootstock: '',
  notes: '',
})

// ── 일괄 추가 ────────────────────────────────────────────────────────────────
const batchMode = ref(false)
const batch = reactive({
  greenhouseId: '',
  rowFrom: 1,
  rowTo: 27,
  cols: ['A', 'B'],
  variety: '',
  plantedAt: '',
  rootstock: '',
  notes: '',
})

const batchCount = computed(() => {
  const span = Number(batch.rowTo) - Number(batch.rowFrom) + 1
  return span > 0 ? span * batch.cols.length : 0
})

function greenhouseName(greenhouseId) {
  return (
    store.state.facilities.find((f) => f.id === greenhouseId)?.name ||
    localeStore.t('common.unknown')
  )
}

async function confirmDeleteSeedling(seedling) {
  const logs = (seedling.growthLogs || []).length
  const ok = await confirm({
    message: localeStore.t('confirm.seedling', { name: seedling.variety, logs }),
  })
  if (ok) await store.removeSeedling(seedling.id)
}

function positionText(seedling) {
  if (!seedling.positionRow && !seedling.positionCol) return ''
  const parts = []
  if (seedling.positionRow) parts.push(`${seedling.positionRow}${localeStore.t('seedlings.positionUnit')}`)
  if (seedling.positionCol) parts.push(seedling.positionCol)
  return parts.join(' ')
}

function clearForm() {
  form.id = ''
  form.greenhouseId = store.state.facilities[0]?.id || ''
  form.positionRow = ''
  form.positionCol = ''
  form.variety = varieties.value[0] ?? ''
  form.plantedAt = ''
  form.rootstock = ''
  form.notes = ''
  editingId.value = ''
}

function openAdd() {
  clearForm()
  batchMode.value = false
  showForm.value = true
  formOpen.value = true
}

// '+ 새 묘목' — 새 입력 폼으로 전환 후, 모바일에서 폼이 보이도록 스크롤
function newEntry() {
  clearForm()
  if (isMobile.value) {
    nextTick(() => document.getElementById('seed-form-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
}

function clearBatch() {
  batch.greenhouseId = store.state.facilities[0]?.id || ''
  batch.rowFrom = 1
  batch.rowTo = 27
  batch.cols = ['A', 'B']
  batch.variety = varieties.value[0] ?? ''
  batch.plantedAt = ''
  batch.rootstock = ''
  batch.notes = ''
}

function openBatch() {
  clearForm()
  clearBatch()
  batchMode.value = true
  showForm.value = true
  formOpen.value = true
}

function toggleBatchCol(col) {
  const i = batch.cols.indexOf(col)
  if (i >= 0) batch.cols.splice(i, 1)
  else batch.cols.push(col)
}

async function saveBatch() {
  const from = Number(batch.rowFrom)
  const to = Number(batch.rowTo)
  if (!batch.greenhouseId || from > to || !batch.cols.length) return

  const payloads = []
  for (let row = from; row <= to; row += 1) {
    for (const col of colOptions.filter((c) => batch.cols.includes(c))) {
      payloads.push({
        greenhouseId: batch.greenhouseId,
        positionRow: row,
        positionCol: col,
        variety: batch.variety,
        plantedAt: batch.plantedAt,
        rootstock: batch.rootstock,
        notes: batch.notes,
      })
    }
  }

  await store.addSeedlingsBatch(payloads)
  closeForm()
}

function editSeedling(seedling) {
  // 이미 이 묘목 편집 중이면 그대로 둔다(재클릭해도 닫지 않음)
  if (editingId.value === seedling.id) return
  batchMode.value = false
  formOpen.value = true
  expandedId.value = '' // 성장기록 패널과 상호 배타
  form.id = seedling.id
  form.greenhouseId = seedling.greenhouseId
  form.positionRow = seedling.positionRow || ''
  form.positionCol = seedling.positionCol || ''
  form.variety = seedling.variety
  form.plantedAt = seedling.plantedAt
  form.rootstock = seedling.rootstock
  form.notes = seedling.notes
  editingId.value = seedling.id
  showForm.value = true
  scrollToItem(`seed-form-slot-${seedling.id}`)
}

// 모바일에서 편집 시 해당 항목(과 아래 폼)이 보이도록 스크롤
function scrollToItem(slotId) {
  if (!isMobile.value) return
  nextTick(() => {
    const el = document.getElementById(slotId)
    ;(el?.closest('li') ?? el)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

function closeForm() {
  clearForm()
  batchMode.value = false
  showForm.value = false
  formOpen.value = false
}

async function saveSeedling() {
  await store.upsertSeedling({
    id: form.id,
    greenhouseId: form.greenhouseId,
    positionRow: form.positionRow,
    positionCol: form.positionCol,
    variety: form.variety,
    plantedAt: form.plantedAt,
    rootstock: form.rootstock,
    notes: form.notes,
  })
  clearForm()
}

// ── 성장 기록 ────────────────────────────────────────────────────────────────
function logKey(log) {
  return log.id || log.date
}

function formatLogDate(dateStr) {
  try {
    return format(new Date(dateStr), 'MM/dd HH:mm')
  } catch {
    return dateStr
  }
}

async function filesToPreviews(files) {
  let originalTotal = 0
  let compressedTotal = 0

  const previews = await Promise.all(
    files.map(async (file) => {
      const compressed = await compressImageFile(file, {
        maxWidth: 1280,
        maxHeight: 1280,
        quality: 0.78,
        outputType: 'image/jpeg',
      })
      originalTotal += compressed.originalSize
      compressedTotal += compressed.compressedSize
      return {
        id: crypto.randomUUID(),
        name: file.name,
        dataUrl: compressed.dataUrl,
        contentType: compressed.contentType,
        size: compressed.compressedSize,
        width: compressed.width,
        height: compressed.height,
        originalSize: compressed.originalSize,
      }
    }),
  )

  const report = previews.length
    ? localeStore.t('seedlings.compressedReport', {
        count: previews.length,
        from: Math.round(originalTotal / 1024),
        to: Math.round(compressedTotal / 1024),
        ratio: originalTotal > 0 ? Math.round((compressedTotal / originalTotal) * 100) : 100,
      })
    : ''

  return { previews, report }
}

function openLightbox(photo) {
  lightboxPhoto.value = photo
}

function closeLightbox() {
  lightboxPhoto.value = null
}

function toggleLogPanel(seedling) {
  if (expandedId.value === seedling.id) {
    expandedId.value = ''
    return
  }
  if (editingId.value) clearForm() // 편집 폼과 상호 배타
  formOpen.value = false
  expandedId.value = seedling.id
  logNote.value = ''
  logPhotoPreviews.value = []
  logCompressionReport.value = ''
  cancelEditLog()
}

async function handleLogPhotoChange(event) {
  const files = Array.from(event.target.files || []).slice(0, 5)
  const { previews, report } = await filesToPreviews(files)
  logPhotoPreviews.value = previews
  logCompressionReport.value = report
}

function removeLogPreviewPhoto(id) {
  logPhotoPreviews.value = logPhotoPreviews.value.filter((p) => p.id !== id)
}

async function recordLog(seedling) {
  if (!logNote.value.trim()) return
  let photos
  try {
    photos = await store.savePhotos(logPhotoPreviews.value)
  } catch (e) {
    console.error('[SeedlingsView] 사진 업로드 실패', e)
    alert(localeStore.t('common.photoUploadFailed'))
    return
  }
  await store.addSeedlingLog(seedling.id, logNote.value, photos)
  logNote.value = ''
  logPhotoPreviews.value = []
  logCompressionReport.value = ''
}

function startEditLog(log) {
  editingLogId.value = logKey(log)
  editLogNote.value = log.note
  editLogPhotos.value = [...(log.photos || [])]
  editLogNewPreviews.value = []
  editLogCompressionReport.value = ''
}

function cancelEditLog() {
  editingLogId.value = ''
  editLogNote.value = ''
  editLogPhotos.value = []
  editLogNewPreviews.value = []
  editLogCompressionReport.value = ''
}

function removeEditExistingPhoto(id) {
  editLogPhotos.value = editLogPhotos.value.filter((p) => p.id !== id)
}

async function handleEditLogPhotoChange(event) {
  const files = Array.from(event.target.files || []).slice(0, 5)
  const { previews, report } = await filesToPreviews(files)
  editLogNewPreviews.value = previews
  editLogCompressionReport.value = report
}

function removeEditNewPhoto(id) {
  editLogNewPreviews.value = editLogNewPreviews.value.filter((p) => p.id !== id)
}

async function saveEditLog(seedling) {
  if (!editingLogId.value || !editLogNote.value.trim()) return
  let uploaded
  try {
    uploaded = await store.savePhotos(editLogNewPreviews.value)
  } catch (e) {
    console.error('[SeedlingsView] 사진 업로드 실패', e)
    alert(localeStore.t('common.photoUploadFailed'))
    return
  }
  const photos = [...editLogPhotos.value, ...uploaded]
  await store.updateSeedlingLog(seedling.id, editingLogId.value, {
    note: editLogNote.value,
    photos,
  })
  cancelEditLog()
}

async function deleteLog(seedling, log) {
  await store.removeSeedlingLog(seedling.id, logKey(log))
  if (editingLogId.value === logKey(log)) cancelEditLog()
}

clearForm()
</script>

<template>
  <div v-if="lightboxPhoto" class="lightbox-overlay" @click="closeLightbox">
    <img :src="store.photoSrc(lightboxPhoto)" :alt="localeStore.t('seedlings.growthPhoto')" />
  </div>

  <section :class="['page-grid', showForm && formOpen ? 'two-columns' : '']">
    <article class="card">
      <div class="row-actions align-start">
        <h2>{{ localeStore.t('seedlings.overview') }}</h2>
        <div v-if="!showForm" class="row-actions">
          <button class="ghost" @click="openBatch">{{ localeStore.t('seedlings.batchAdd') }}</button>
          <button @click="openAdd">{{ localeStore.t('common.edit') }}</button>
        </div>
        <button v-else class="ghost" @click="closeForm">{{ localeStore.t('common.exitEdit') }}</button>
      </div>

      <div class="sort-filter-bar">
        <span class="filter-label">{{ localeStore.t('seedlings.sortBy') }}</span>
        <select v-model="sortBy" class="compact-select">
          <option value="greenhouse">{{ localeStore.t('seedlings.sortGreenhouse') }}</option>
          <option value="variety">{{ localeStore.t('seedlings.sortVariety') }}</option>
          <option value="plantedAt">{{ localeStore.t('seedlings.sortPlantedAt') }}</option>
        </select>
        <button
          class="ghost compact-btn"
          type="button"
          :title="sortDir === 'asc' ? localeStore.t('seedlings.ascending') : localeStore.t('seedlings.descending')"
          @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'"
        >{{ sortDir === 'asc' ? '↑' : '↓' }}</button>
        <span class="filter-sep">|</span>
        <span class="filter-label">{{ localeStore.t('seedlings.filterGreenhouse') }}</span>
        <select v-model="filterGreenhouseId" class="compact-select">
          <option value="">{{ localeStore.t('seedlings.filterAll') }}</option>
          <option v-for="f in store.state.facilities" :key="f.id" :value="f.id">{{ f.name }}</option>
        </select>
        <span class="filter-label">{{ localeStore.t('seedlings.filterVariety') }}</span>
        <select v-model="filterVariety" class="compact-select">
          <option value="">{{ localeStore.t('seedlings.filterAll') }}</option>
          <option v-for="v in varieties" :key="v" :value="v">{{ v }}</option>
        </select>
      </div>

      <div id="seed-form-top" class="mobile-form-slot"></div>

      <ul class="list clean">
        <li v-for="seedling in displayedSeedlings" :key="seedling.id" class="list-item card-like">
          <div>
            <p class="item-title">{{ seedling.variety }}<template v-if="positionText(seedling)"> · {{ positionText(seedling) }}</template></p>
            <p class="item-meta">
              {{ greenhouseName(seedling.greenhouseId) }} · {{ localeStore.t('seedlings.planted') }} {{ seedling.plantedAt }}
            </p>
            <p class="muted">{{ localeStore.t('seedlings.rootstockLabel') }}: {{ seedling.rootstock || localeStore.t('seedlings.na') }}</p>
            <p class="muted">{{ seedling.notes }}</p>
          </div>
          <div class="row-actions">
            <button :class="{ ghost: expandedId !== seedling.id }" type="button" @click="toggleLogPanel(seedling)">{{ localeStore.t('seedlings.growthLog') }}</button>
            <template v-if="showForm">
              <button :class="{ ghost: editingId !== seedling.id }" @click="editSeedling(seedling)">{{ localeStore.t('common.edit') }}</button>
              <button class="danger" @click="confirmDeleteSeedling(seedling)">{{ localeStore.t('common.delete') }}</button>
            </template>
          </div>

          <!-- 성장 기록 인라인 패널 -->
          <div v-if="expandedId === seedling.id" class="log-panel">
            <form class="stack-form" style="margin-bottom: 1rem;" @submit.prevent="recordLog(seedling)">
              <label>{{ localeStore.t('seedlings.growthNote') }}
                <textarea v-model="logNote" required rows="3" />
              </label>
              <label class="step-photo-label">{{ localeStore.t('seedlings.attachPhotos') }}
                <input accept="image/*" multiple type="file" @change="handleLogPhotoChange" />
              </label>
              <p class="muted" style="font-size: 0.78rem;">{{ localeStore.t('seedlings.photoLimit') }}</p>
              <p v-if="logCompressionReport" class="muted" style="font-size: 0.78rem;">{{ logCompressionReport }}</p>
              <div v-if="logPhotoPreviews.length" class="photo-grid">
                <figure v-for="photo in logPhotoPreviews" :key="photo.id" class="photo-card">
                  <button type="button" class="photo-card-btn" @click="openLightbox(photo)">
                    <img :src="store.photoSrc(photo)" :alt="localeStore.t('seedlings.growthPhoto')" />
                  </button>
                  <button type="button" class="danger photo-card-delete" @click="removeLogPreviewPhoto(photo.id)">{{ localeStore.t('common.delete') }}</button>
                </figure>
              </div>
              <button type="submit">{{ localeStore.t('seedlings.addGrowthLog') }}</button>
            </form>

            <p class="muted log-history-label">{{ localeStore.t('seedlings.growthHistory') }}</p>
            <ul class="list clean">
              <li v-for="log in (seedling.growthLogs || [])" :key="logKey(log)" class="list-item">
                <!-- 표시 모드 -->
                <template v-if="editingLogId !== logKey(log)">
                  <div class="log-entry">
                    <span class="log-entry-info">
                      <span class="item-meta">{{ formatLogDate(log.date) }}</span>
                    </span>
                    <span class="log-entry-actions">
                      <button class="ghost icon-btn" type="button" :title="localeStore.t('common.edit')" :aria-label="localeStore.t('common.edit')" @click="startEditLog(log)">✎</button>
                      <button class="danger icon-btn" type="button" :title="localeStore.t('common.delete')" :aria-label="localeStore.t('common.delete')" @click="deleteLog(seedling, log)">✕</button>
                    </span>
                  </div>
                  <p style="font-size: 0.9rem; white-space: pre-wrap;">{{ log.note }}</p>
                  <div v-if="log.photos?.length" class="photo-grid compact-grid">
                    <figure v-for="photo in log.photos" :key="photo.id" class="photo-card">
                      <button type="button" class="photo-card-btn" @click="openLightbox(photo)">
                        <img :src="store.photoSrc(photo)" :alt="localeStore.t('seedlings.growthPhoto')" />
                      </button>
                      <figcaption>{{ photo.name }}</figcaption>
                    </figure>
                  </div>
                </template>

                <!-- 편집 모드 -->
                <template v-else>
                  <p class="item-meta">{{ formatLogDate(log.date) }}</p>
                  <form class="stack-form" @submit.prevent="saveEditLog(seedling)">
                    <label>{{ localeStore.t('seedlings.growthNote') }}
                      <textarea v-model="editLogNote" required rows="3" />
                    </label>
                    <template v-if="editLogPhotos.length">
                      <p class="muted" style="font-size: 0.78rem;">{{ localeStore.t('seedlings.existingPhotos') }}</p>
                      <div class="photo-grid">
                        <figure v-for="photo in editLogPhotos" :key="photo.id" class="photo-card">
                          <button type="button" class="photo-card-btn" @click="openLightbox(photo)">
                            <img :src="store.photoSrc(photo)" :alt="localeStore.t('seedlings.growthPhoto')" />
                          </button>
                          <button type="button" class="danger photo-card-delete" @click="removeEditExistingPhoto(photo.id)">{{ localeStore.t('common.delete') }}</button>
                        </figure>
                      </div>
                    </template>
                    <label class="step-photo-label">{{ localeStore.t('seedlings.attachPhotos') }}
                      <input accept="image/*" multiple type="file" @change="handleEditLogPhotoChange" />
                    </label>
                    <p v-if="editLogCompressionReport" class="muted" style="font-size: 0.78rem;">{{ editLogCompressionReport }}</p>
                    <div v-if="editLogNewPreviews.length" class="photo-grid">
                      <figure v-for="photo in editLogNewPreviews" :key="photo.id" class="photo-card">
                        <button type="button" class="photo-card-btn" @click="openLightbox(photo)">
                          <img :src="store.photoSrc(photo)" :alt="localeStore.t('seedlings.growthPhoto')" />
                        </button>
                        <button type="button" class="danger photo-card-delete" @click="removeEditNewPhoto(photo.id)">{{ localeStore.t('common.delete') }}</button>
                      </figure>
                    </div>
                    <div class="row-actions">
                      <button type="submit">{{ localeStore.t('common.change') }}</button>
                      <button class="ghost" type="button" @click="cancelEditLog">{{ localeStore.t('common.cancel') }}</button>
                    </div>
                  </form>
                </template>
              </li>
              <li v-if="!seedling.growthLogs?.length" class="muted" style="font-size: 0.85rem;">{{ localeStore.t('seedlings.noGrowthLogs') }}</li>
            </ul>
          </div>
          <div :id="`seed-form-slot-${seedling.id}`" class="mobile-form-slot"></div>
        </li>
        <li v-if="!displayedSeedlings.length" class="muted">{{ localeStore.t('common.noData') }}</li>
      </ul>
    </article>

    <Teleport v-if="showForm && formOpen" :to="formTarget" :disabled="!isMobile">
    <article v-if="showForm && formOpen && batchMode" class="card">
      <h2>{{ localeStore.t('seedlings.batchTitle') }}</h2>
      <form class="stack-form" @submit.prevent="saveBatch">
        <label>
          {{ localeStore.t('seedlings.greenhouse') }}
          <select v-model="batch.greenhouseId" required>
            <option v-for="facility in store.state.facilities" :key="facility.id" :value="facility.id">
              {{ facility.name }}
            </option>
          </select>
        </label>
        <label>{{ localeStore.t('seedlings.batchRowRange') }}</label>
        <div class="row-actions">
          <label style="flex: 1;">
            {{ localeStore.t('seedlings.batchRowFrom') }}
            <select v-model.number="batch.rowFrom">
              <option v-for="r in rowOptions" :key="r" :value="r">{{ r }}{{ localeStore.t('seedlings.positionUnit') }}</option>
            </select>
          </label>
          <label style="flex: 1;">
            {{ localeStore.t('seedlings.batchRowTo') }}
            <select v-model.number="batch.rowTo">
              <option v-for="r in rowOptions" :key="r" :value="r">{{ r }}{{ localeStore.t('seedlings.positionUnit') }}</option>
            </select>
          </label>
        </div>
        <label>{{ localeStore.t('seedlings.batchCols') }}</label>
        <div class="row-actions">
          <label v-for="c in colOptions" :key="c" style="display: flex; flex-direction: row; align-items: center; gap: 0.3rem;">
            <input type="checkbox" :checked="batch.cols.includes(c)" @change="toggleBatchCol(c)" />
            {{ c }}
          </label>
        </div>
        <label>
          {{ localeStore.t('seedlings.variety') }}
          <select v-model="batch.variety">
            <option v-for="v in varieties" :key="v" :value="v">{{ v }}</option>
          </select>
        </label>
        <label>
          {{ localeStore.t('seedlings.plantingDate') }}
          <input v-model="batch.plantedAt" required type="date" />
        </label>
        <label>
          {{ localeStore.t('seedlings.rootstock') }}
          <select v-model="batch.rootstock">
            <option value="">{{ localeStore.t('seedlings.na') }}</option>
            <option v-for="r in store.state.appSettings?.rootstockTypes ?? []" :key="r" :value="r">{{ r }}</option>
          </select>
        </label>
        <label>
          {{ localeStore.t('seedlings.notes') }}
          <textarea v-model="batch.notes" rows="3" />
        </label>
        <p class="muted">{{ localeStore.t('seedlings.batchPreview', { count: batchCount }) }}</p>
        <div class="row-actions">
          <button type="submit" :disabled="batchCount === 0">{{ localeStore.t('seedlings.batchSubmit', { count: batchCount }) }}</button>
          <button class="ghost" type="button" @click="clearBatch">{{ localeStore.t('common.reset') }}</button>
        </div>
      </form>
    </article>

    <article v-if="showForm && formOpen && !batchMode" class="card">
      <h2>{{ editingId ? localeStore.t('seedlings.editTitle') : localeStore.t('seedlings.addTitle') }}</h2>
      <form class="stack-form" @submit.prevent="saveSeedling">
        <label>
          {{ localeStore.t('seedlings.greenhouse') }}
          <select v-model="form.greenhouseId" required>
            <option v-for="facility in store.state.facilities" :key="facility.id" :value="facility.id">
              {{ facility.name }}
            </option>
          </select>
        </label>
        <label>{{ localeStore.t('seedlings.position') }}</label>
        <div class="row-actions">
          <label style="flex: 1;">
            {{ localeStore.t('seedlings.positionRow') }}
            <select v-model="form.positionRow">
              <option value="">{{ localeStore.t('seedlings.na') }}</option>
              <option v-for="r in rowOptions" :key="r" :value="r">{{ r }}{{ localeStore.t('seedlings.positionUnit') }}</option>
            </select>
          </label>
          <label style="flex: 1;">
            {{ localeStore.t('seedlings.positionCol') }}
            <select v-model="form.positionCol">
              <option value="">{{ localeStore.t('seedlings.na') }}</option>
              <option v-for="c in colOptions" :key="c" :value="c">{{ c }}</option>
            </select>
          </label>
        </div>
        <label>
          {{ localeStore.t('seedlings.variety') }}
          <select v-model="form.variety">
            <option v-for="v in varieties" :key="v" :value="v">{{ v }}</option>
          </select>
        </label>
        <label>
          {{ localeStore.t('seedlings.plantingDate') }}
          <input v-model="form.plantedAt" required type="date" />
        </label>
        <label>
          {{ localeStore.t('seedlings.rootstock') }}
          <select v-model="form.rootstock">
            <option value="">{{ localeStore.t('seedlings.na') }}</option>
            <option v-for="r in store.state.appSettings?.rootstockTypes ?? []" :key="r" :value="r">{{ r }}</option>
          </select>
        </label>
        <label>
          {{ localeStore.t('seedlings.notes') }}
          <textarea v-model="form.notes" rows="3" />
        </label>
        <div class="row-actions">
          <button type="submit">{{ editingId ? localeStore.t('common.change') : localeStore.t('common.add') }}</button>
          <button v-if="editingId" class="ghost" type="button" @click="newEntry">{{ localeStore.t('seedlings.newEntry') }}</button>
        </div>
      </form>
    </article>
    </Teleport>
  </section>
</template>

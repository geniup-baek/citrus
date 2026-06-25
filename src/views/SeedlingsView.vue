<script setup>
import { computed, reactive, ref } from 'vue'
import { format } from 'date-fns'
import { useFarmStore } from '../stores/farmStore'
import { useLocaleStore } from '../stores/localeStore'
import { compressImageFile } from '../utils/imageProcessing'

const store = useFarmStore()
const localeStore = useLocaleStore()
const editingId = ref('')
const showForm = ref(false)

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

  list.sort((a, b) => {
    let va, vb
    if (sortBy.value === 'greenhouse') {
      va = greenhouseName(a.greenhouseId)
      vb = greenhouseName(b.greenhouseId)
    } else if (sortBy.value === 'variety') {
      va = a.variety
      vb = b.variety
    } else {
      va = a.plantedAt
      vb = b.plantedAt
    }
    return sortDir.value === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
  })

  return list
})

const form = reactive({
  id: '',
  greenhouseId: '',
  variety: '',
  quantity: 0,
  plantedAt: '',
  rootstock: '',
  notes: '',
})

function greenhouseName(greenhouseId) {
  return (
    store.state.facilities.find((f) => f.id === greenhouseId)?.name ||
    localeStore.t('common.unknown')
  )
}

function clearForm() {
  form.id = ''
  form.greenhouseId = store.state.facilities[0]?.id || ''
  form.variety = varieties.value[0] ?? ''
  form.quantity = 0
  form.plantedAt = ''
  form.rootstock = ''
  form.notes = ''
  editingId.value = ''
}

function openAdd() {
  clearForm()
  showForm.value = true
}

function editSeedling(seedling) {
  form.id = seedling.id
  form.greenhouseId = seedling.greenhouseId
  form.variety = seedling.variety
  form.quantity = seedling.quantity
  form.plantedAt = seedling.plantedAt
  form.rootstock = seedling.rootstock
  form.notes = seedling.notes
  editingId.value = seedling.id
  showForm.value = true
}

function closeForm() {
  clearForm()
  showForm.value = false
}

async function saveSeedling() {
  await store.upsertSeedling({
    id: form.id,
    greenhouseId: form.greenhouseId,
    variety: form.variety,
    quantity: Number(form.quantity),
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

function previewToPhoto(photo) {
  return {
    id: photo.id,
    name: photo.name,
    contentType: photo.contentType,
    size: photo.size,
    width: photo.width,
    height: photo.height,
    originalSize: photo.originalSize,
    createdAt: new Date().toISOString(),
    dataUrl: photo.dataUrl,
  }
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
  const photos = logPhotoPreviews.value.map(previewToPhoto)
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
  const photos = [...editLogPhotos.value, ...editLogNewPreviews.value.map(previewToPhoto)]
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
    <img :src="lightboxPhoto.dataUrl" :alt="localeStore.t('seedlings.growthPhoto')" />
  </div>

  <section :class="['page-grid', showForm ? 'two-columns' : '']">
    <article class="card">
      <div class="row-actions align-start">
        <h2>{{ localeStore.t('seedlings.overview') }}</h2>
        <button v-if="!showForm" class="ghost" @click="openAdd">{{ localeStore.t('common.edit') }}</button>
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

      <ul class="list clean">
        <li v-for="seedling in displayedSeedlings" :key="seedling.id" class="list-item card-like">
          <div>
            <p class="item-title">{{ seedling.variety }} · {{ seedling.quantity }} {{ localeStore.t('seedlings.treeUnit') }}</p>
            <p class="item-meta">
              {{ greenhouseName(seedling.greenhouseId) }} · {{ localeStore.t('seedlings.planted') }} {{ seedling.plantedAt }}
            </p>
            <p class="muted">{{ localeStore.t('seedlings.rootstockLabel') }}: {{ seedling.rootstock || localeStore.t('seedlings.na') }}</p>
            <p class="muted">{{ seedling.notes }}</p>
          </div>
          <div class="row-actions">
            <button class="ghost" type="button" @click="toggleLogPanel(seedling)">{{ localeStore.t('seedlings.growthLog') }}</button>
            <template v-if="showForm">
              <button class="ghost" @click="editSeedling(seedling)">{{ localeStore.t('common.edit') }}</button>
              <button class="danger" @click="store.removeSeedling(seedling.id)">{{ localeStore.t('common.delete') }}</button>
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
                    <img :src="photo.dataUrl" :alt="localeStore.t('seedlings.growthPhoto')" />
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
                        <img :src="photo.dataUrl" :alt="localeStore.t('seedlings.growthPhoto')" />
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
                            <img :src="photo.dataUrl" :alt="localeStore.t('seedlings.growthPhoto')" />
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
                          <img :src="photo.dataUrl" :alt="localeStore.t('seedlings.growthPhoto')" />
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
        </li>
        <li v-if="!displayedSeedlings.length" class="muted">{{ localeStore.t('common.noData') }}</li>
      </ul>
    </article>

    <article v-if="showForm" class="card">
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
        <label>
          {{ localeStore.t('seedlings.variety') }}
          <select v-model="form.variety">
            <option v-for="v in varieties" :key="v" :value="v">{{ v }}</option>
          </select>
        </label>
        <label>
          {{ localeStore.t('seedlings.quantity') }}
          <input v-model="form.quantity" min="0" required type="number" />
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
          <button class="ghost" type="button" @click="clearForm">{{ localeStore.t('common.reset') }}</button>
        </div>
      </form>
    </article>
  </section>
</template>

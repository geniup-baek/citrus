<script setup>
import { computed, reactive, ref } from 'vue'
import { useFarmStore } from '../stores/farmStore'
import { compressImageFile } from '../utils/imageProcessing'
import { useLocaleStore } from '../stores/localeStore'

const store = useFarmStore()
const localeStore = useLocaleStore()
const selectedIssueId = ref('')
const recommendationQuery = ref('')

const issueForm = reactive({
  title: '',
  greenhouseId: '',
  occurredAt: '',
  status: 'investigating',
  symptoms: '',
})

const photoFiles = ref([])
const photoPreviews = ref([])
const compressionReport = ref('')

const resolutionNote = ref('')

const selectedIssue = computed(() =>
  store.state.issues.find((issue) => issue.id === selectedIssueId.value),
)

const recommendations = computed(() => {
  const derivedQuery = recommendationQuery.value.trim() || issueForm.symptoms.trim()
  const queryPhotos = photoPreviews.value.map((photo) => ({
    name: photo.name,
    contentType: photo.contentType,
    width: photo.width,
    height: photo.height,
    size: photo.size,
  }))

  if (!derivedQuery && !queryPhotos.length) {
    return []
  }

  return store.suggestSimilarIssues({
    query: derivedQuery,
    photos: queryPhotos,
  })
})

function greenhouseName(greenhouseId) {
  return (
    store.state.facilities.find((facility) => facility.id === greenhouseId)?.name ||
    localeStore.t('common.unknown')
  )
}

function issueStatusLabel(value) {
  const map = {
    investigating: localeStore.t('issues.statusInvestigating'),
    mitigating: localeStore.t('issues.statusMitigating'),
    resolved: localeStore.t('issues.statusResolved'),
  }

  return map[value] || value
}

async function handlePhotoChange(event) {
  const files = Array.from(event.target.files || [])
  photoFiles.value = files.slice(0, 5)

  let originalTotal = 0
  let compressedTotal = 0

  photoPreviews.value = await Promise.all(
    photoFiles.value.map(async (file) => {
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

  if (photoPreviews.value.length) {
    const ratio = originalTotal > 0 ? Math.round((compressedTotal / originalTotal) * 100) : 100
    compressionReport.value = localeStore.t('issues.compressedReport', {
      count: photoPreviews.value.length,
      from: Math.round(originalTotal / 1024),
      to: Math.round(compressedTotal / 1024),
      ratio,
    })
  } else {
    compressionReport.value = ''
  }
}

async function addIssue() {
  const photos = photoPreviews.value.map((photo) => ({
    id: photo.id,
    name: photo.name,
    contentType: photo.contentType,
    size: photo.size,
    width: photo.width,
    height: photo.height,
    originalSize: photo.originalSize,
    createdAt: new Date().toISOString(),
    dataUrl: photo.dataUrl,
  }))

  await store.upsertIssue({
    title: issueForm.title,
    greenhouseId: issueForm.greenhouseId,
    occurredAt: issueForm.occurredAt,
    status: issueForm.status,
    symptoms: issueForm.symptoms,
    resolutionSteps: [],
    photos,
  })

  issueForm.title = ''
  issueForm.status = 'investigating'
  issueForm.symptoms = ''
  photoFiles.value = []
  photoPreviews.value = []
  compressionReport.value = ''
}

async function addStep() {
  if (!selectedIssue.value || !resolutionNote.value.trim()) {
    return
  }

  await store.addIssueResolutionStep(selectedIssue.value.id, resolutionNote.value)
  resolutionNote.value = ''
}

issueForm.greenhouseId = store.state.facilities[0]?.id || ''
issueForm.occurredAt = new Date().toISOString().slice(0, 10)
</script>

<template>
  <section class="page-grid two-columns">
    <article class="card">
      <h2>{{ localeStore.t('issues.recordIssue') }}</h2>
      <form class="stack-form" @submit.prevent="addIssue">
        <label>
          {{ localeStore.t('issues.issueTitle') }}
          <input v-model="issueForm.title" required type="text" :placeholder="localeStore.t('issues.issueTitlePlaceholder')" />
        </label>
        <label>
          {{ localeStore.t('issues.greenhouse') }}
          <select v-model="issueForm.greenhouseId" required>
            <option v-for="facility in store.state.facilities" :key="facility.id" :value="facility.id">
              {{ facility.name }}
            </option>
          </select>
        </label>
        <label>
          {{ localeStore.t('issues.dateObserved') }}
          <input v-model="issueForm.occurredAt" required type="date" />
        </label>
        <label>
          {{ localeStore.t('issues.status') }}
          <select v-model="issueForm.status">
            <option value="investigating">{{ localeStore.t('issues.statusInvestigating') }}</option>
            <option value="mitigating">{{ localeStore.t('issues.statusMitigating') }}</option>
            <option value="resolved">{{ localeStore.t('issues.statusResolved') }}</option>
          </select>
        </label>
        <label>
          {{ localeStore.t('issues.symptoms') }}
          <textarea v-model="issueForm.symptoms" required rows="4" />
        </label>
        <label>
          {{ localeStore.t('issues.attachPhotos') }}
          <input accept="image/*" multiple type="file" @change="handlePhotoChange" />
        </label>
        <p class="muted">{{ localeStore.t('issues.photoLimit') }}</p>
        <p v-if="compressionReport" class="muted">{{ compressionReport }}</p>

        <div v-if="photoPreviews.length" class="photo-grid">
          <figure v-for="photo in photoPreviews" :key="photo.name" class="photo-card">
            <img :src="photo.dataUrl" :alt="localeStore.t('issues.issueEvidence')" />
            <figcaption>{{ photo.name }}</figcaption>
          </figure>
        </div>
        <button type="submit">{{ localeStore.t('issues.saveIssue') }}</button>
      </form>

      <h3 class="section-title">{{ localeStore.t('issues.findSimilar') }}</h3>
      <label>
        {{ localeStore.t('issues.searchText') }}
        <textarea
          v-model="recommendationQuery"
          rows="3"
          :placeholder="localeStore.t('issues.searchPlaceholder')"
        />
      </label>

      <ul class="list clean compact">
        <li v-for="entry in recommendations" :key="entry.issue.id" class="list-item">
          <p class="item-title">{{ localeStore.t('issues.scoreLabel', { title: entry.issue.title, score: entry.score.toFixed(2) }) }}</p>
          <p class="item-meta">{{ entry.issue.symptoms }}</p>
          <p class="muted">{{ localeStore.t('issues.textPhotoScore', { text: entry.textScore.toFixed(2), photo: entry.photoScore.toFixed(2) }) }}</p>
          <p class="muted">
            {{ localeStore.t('issues.steps') }}: {{ (entry.issue.resolutionSteps || []).map((step) => step.note).join(' | ') || localeStore.t('issues.noSteps') }}
          </p>
        </li>
      </ul>
    </article>

    <article class="card">
      <h2>{{ localeStore.t('issues.issueHistory') }}</h2>
      <ul class="list clean">
        <li v-for="issue in store.state.issues" :key="issue.id" class="list-item card-like">
          <div>
            <p class="item-title">{{ issue.title }}</p>
            <p class="item-meta">{{ greenhouseName(issue.greenhouseId) }} · {{ issue.occurredAt }}</p>
            <p class="muted">{{ issue.symptoms }}</p>
            <div v-if="issue.photos?.length" class="photo-grid compact-grid">
              <a
                v-for="photo in issue.photos"
                :key="photo.id"
                class="photo-card"
                :href="photo.dataUrl"
                target="_blank"
                rel="noreferrer"
              >
                <img :src="photo.dataUrl" :alt="localeStore.t('issues.issueEvidence')" />
                <figcaption>{{ photo.name }}</figcaption>
              </a>
            </div>
          </div>
          <div class="row-actions">
            <button class="ghost" @click="selectedIssueId = issue.id">{{ localeStore.t('issues.resolution') }}</button>
            <button class="danger" @click="store.removeIssue(issue.id)">{{ localeStore.t('common.delete') }}</button>
          </div>
        </li>
      </ul>

      <div v-if="selectedIssue" class="sub-card">
        <h3>{{ localeStore.t('issues.resolutionLog', { title: selectedIssue.title }) }}</h3>
        <form class="stack-form" @submit.prevent="addStep">
          <label>
            {{ localeStore.t('issues.newResolutionStep') }}
            <textarea v-model="resolutionNote" rows="3" required />
          </label>
          <button type="submit">{{ localeStore.t('issues.addStep') }}</button>
        </form>

        <ul class="list clean compact">
          <li
            v-for="step in selectedIssue.resolutionSteps"
            :key="step.date + step.note"
            class="list-item"
          >
            <p class="item-meta">{{ step.date }}</p>
            <p>{{ step.note }}</p>
          </li>
        </ul>
      </div>
    </article>
  </section>
</template>

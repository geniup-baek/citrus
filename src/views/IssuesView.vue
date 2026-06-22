<script setup>
import { computed, reactive, ref } from 'vue'
import { useFarmStore } from '../stores/farmStore'

const store = useFarmStore()
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

const resolutionNote = ref('')

const selectedIssue = computed(() =>
  store.state.issues.find((issue) => issue.id === selectedIssueId.value),
)

const recommendations = computed(() => {
  if (!recommendationQuery.value.trim()) {
    return []
  }

  return store.suggestSimilarIssues(recommendationQuery.value)
})

function greenhouseName(greenhouseId) {
  return store.state.facilities.find((facility) => facility.id === greenhouseId)?.name || 'Unknown'
}

function toDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Failed to load image.'))
    reader.readAsDataURL(file)
  })
}

async function handlePhotoChange(event) {
  const files = Array.from(event.target.files || [])
  photoFiles.value = files.slice(0, 5)

  photoPreviews.value = await Promise.all(
    photoFiles.value.map(async (file) => ({
      name: file.name,
      dataUrl: await toDataUrl(file),
    })),
  )
}

async function addIssue() {
  const photos = await Promise.all(
    photoFiles.value.map(async (file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      contentType: file.type,
      size: file.size,
      createdAt: new Date().toISOString(),
      dataUrl: await toDataUrl(file),
    })),
  )

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
      <h2>Record issue</h2>
      <form class="stack-form" @submit.prevent="addIssue">
        <label>
          Issue title
          <input v-model="issueForm.title" required type="text" placeholder="Sudden yellowing" />
        </label>
        <label>
          Greenhouse
          <select v-model="issueForm.greenhouseId" required>
            <option v-for="facility in store.state.facilities" :key="facility.id" :value="facility.id">
              {{ facility.name }}
            </option>
          </select>
        </label>
        <label>
          Date observed
          <input v-model="issueForm.occurredAt" required type="date" />
        </label>
        <label>
          Status
          <select v-model="issueForm.status">
            <option value="investigating">investigating</option>
            <option value="mitigating">mitigating</option>
            <option value="resolved">resolved</option>
          </select>
        </label>
        <label>
          Symptoms
          <textarea v-model="issueForm.symptoms" required rows="4" />
        </label>
        <label>
          Attach photos
          <input accept="image/*" multiple type="file" @change="handlePhotoChange" />
        </label>
        <p class="muted">Up to 5 images can be attached to a report.</p>

        <div v-if="photoPreviews.length" class="photo-grid">
          <figure v-for="photo in photoPreviews" :key="photo.name" class="photo-card">
            <img :src="photo.dataUrl" alt="Issue evidence" />
            <figcaption>{{ photo.name }}</figcaption>
          </figure>
        </div>
        <button type="submit">Save issue</button>
      </form>

      <h3 class="section-title">Find similar past issues</h3>
      <label>
        Search text
        <textarea
          v-model="recommendationQuery"
          rows="3"
          placeholder="Describe current symptoms and context"
        />
      </label>

      <ul class="list clean compact">
        <li v-for="entry in recommendations" :key="entry.issue.id" class="list-item">
          <p class="item-title">{{ entry.issue.title }} (score {{ entry.score.toFixed(2) }})</p>
          <p class="item-meta">{{ entry.issue.symptoms }}</p>
          <p class="muted">
            Steps: {{ (entry.issue.resolutionSteps || []).map((step) => step.note).join(' | ') || 'No steps yet' }}
          </p>
        </li>
      </ul>
    </article>

    <article class="card">
      <h2>Issue history</h2>
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
                <img :src="photo.dataUrl" alt="Issue evidence" />
                <figcaption>{{ photo.name }}</figcaption>
              </a>
            </div>
          </div>
          <div class="row-actions">
            <button class="ghost" @click="selectedIssueId = issue.id">Resolution</button>
            <button class="danger" @click="store.removeIssue(issue.id)">Delete</button>
          </div>
        </li>
      </ul>

      <div v-if="selectedIssue" class="sub-card">
        <h3>Resolution log - {{ selectedIssue.title }}</h3>
        <form class="stack-form" @submit.prevent="addStep">
          <label>
            New resolution step
            <textarea v-model="resolutionNote" rows="3" required />
          </label>
          <button type="submit">Add step</button>
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

# Citrus Operations Hub (Vue 3 PWA)

Collaborative citrus farm planning app for:

- Greenhouse and facility editing
- Seedling/cultivar records (Hallabong, Karahyang)
- Task planning by annual/month/week/today views
- Progress logs for each task
- Issue logging with resolution history
- Similar issue recommendation based on past records
- Shared data between collaborators via Firebase Firestore
- PWA install support and offline caching

## 1) Local development

```bash
npm install
npm run dev
```

## 2) Shared collaboration setup (Firebase)

Without Firebase env values, the app uses local browser storage only.

### 2.1 Create Firebase project and Firestore

Run these commands from project root:

```bash
npx firebase-tools login
npx firebase-tools projects:create <your-project-id> --display-name "Citrus Operations Hub"
npx firebase-tools use <your-project-id>
npx firebase-tools firestore:databases:create --location=asia-northeast3
npx firebase-tools deploy --only firestore
```

Then update `.firebaserc` default project id:

```json
{
	"projects": {
		"default": "<your-project-id>"
	}
}
```

### 2.2 Create Web App config

In Firebase Console:

1. Project settings > General > Your apps > Add app > Web
1. Register app (for example: `citrus-web`)
1. Copy Firebase SDK config values

Create `.env.local`:

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Restart dev server after editing env values.

Data is synchronized in Firestore document:

- Collection: `shared`
- Document: `farmData`

## 3) Build

```bash
npm run build
npm run preview
```

## 4) GitHub automatic deploy

This repository includes GitHub Actions workflow:

- `.github/workflows/deploy.yml`

Deploy target is GitHub Pages (on push to `main`).

In repository settings:

1. Open `Settings > Pages`.
1. Ensure source is `GitHub Actions`.
1. Push to `main` branch to deploy automatically.

## 5) Notification reminders

Browser notifications are used for due-today pending tasks.

- Allow notification permission in browser.
- App checks reminders every minute while open.

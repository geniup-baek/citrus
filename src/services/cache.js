const PREFIX = 'citrus:'

export function saveCache(key, data) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({
      data,
      fetchedAt: new Date().toISOString(),
    }))
  } catch {}
}

export function loadCache(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    return JSON.parse(raw) // { data, fetchedAt }
  } catch {
    return null
  }
}

// fn 성공 시 캐시 저장, 실패 시 캐시에서 복원
// 반환: { result, fromCache, fetchedAt, cacheError }
// 캐시도 없으면 원래 에러를 그대로 throw
export async function withCache(key, fn) {
  try {
    const result = await fn()
    const fetchedAt = new Date().toISOString()
    saveCache(key, result)
    return { result, fromCache: false, fetchedAt, cacheError: null }
  } catch (e) {
    const cached = loadCache(key)
    if (cached) {
      return {
        result: cached.data,
        fromCache: true,
        fetchedAt: cached.fetchedAt,
        cacheError: e.message,
      }
    }
    throw e
  }
}

export function formatFetchedAt(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

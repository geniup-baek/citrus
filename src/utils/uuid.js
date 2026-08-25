// crypto.randomUUID()는 "보안 컨텍스트"(HTTPS 또는 localhost)에서만 제공된다.
// 개발 서버를 LAN IP(예: http://192.168.x.x:5173)로 열거나, 배포된 페이지를 순수
// http://로 접근하는 경우 등 비보안 컨텍스트에서는 crypto.randomUUID 자체가 없어서
// "crypto.randomUUID is not a function" 에러로 저장이 실패한다.
// crypto.getRandomValues()는 비보안 컨텍스트에서도 쓸 수 있으므로, randomUUID가 없을 때는
// 그걸로 직접 UUID v4를 만들어 대신 쓴다.
export function uuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  // 최후 수단 — 암호학적으로 안전하지는 않지만, 여기서 필요한 건 id 충돌 방지뿐이다.
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

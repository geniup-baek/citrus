// 분류·독성·어독성 값을 배지 CSS 클래스로 바꾸는 순수 함수 — 방제이력·농약추천·가용농약
// 탭이 각자 갖고 있던 매핑 테이블(전부 동일)을 여기 하나로 모았다.
export function categoryClass(cat) {
  return {
    '살균제': 'cat-fungicide',
    '살비제': 'cat-miticide',
    '살충제': 'cat-insecticide',
  }[cat] ?? ''
}

export function toxicClass(grade) {
  return {
    '저독성': 'toxic-low',
    '보통독성': 'toxic-mid',
    '고독성': 'toxic-high',
    '맹독성': 'toxic-extreme',
  }[grade] ?? ''
}

export function fishToxicClass(grade) {
  return {
    'Ⅰ급': 'fishtoxic-1',
    'Ⅱ급': 'fishtoxic-2',
    'Ⅲ급': 'fishtoxic-3',
  }[grade] ?? ''
}

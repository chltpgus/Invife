# Invife 문서

이 폴더에는 Invife 서비스의 기획·설계 문서를 모아 둡니다.

## 문서 목록

| 문서 | 설명 |
|---|---|
| [MVP 최종 기획안](./planning/mvp-plan.md) | 6주 출시를 목표로 한 MVP 범위, 디자인 방향, 기술 구조, 일정 |
| [하객 페이지 디자인 스펙](./design/design-spec.md) | 하객 초대장 UI/UX 스펙 (구현 기준) |
| [제작자(에디터) 디자인 스펙](./design/editor-spec.md) | 제작·발행 화면 UI/UX 스펙 (구현 기준) |
| [디자인 토큰](./design/tokens.json) | 색·타이포·간격 등 디자인 토큰 v1.1 (구현 기준) |
| [하객 데이터 계약 (초안)](./api/guest-data-contract.md) | 하객 페이지가 소비하는 JSON·RSVP API 초안 |
| [제작자 API 계약 (초안)](./api/editor-api-contract.md) | 에디터·발행·사진·명단 API 초안 |
| [화면 지도](./feature-map.md) | 사용자 기준 화면 이름과, 오늘 있는 것 |

Figma는 시각 확인용이에요. 개발 시 기준 문서는 위 스펙과 `tokens.json`입니다.

## 폴더 구조

```
docs/
├── readme.md              # 이 파일
├── feature-map.md         # 화면 이름
├── planning/
│   └── mvp-plan.md        # MVP 최종 기획안
├── api/
│   ├── guest-data-contract.md  # 하객 데이터 계약 초안
│   └── editor-api-contract.md  # 제작자 API 계약 초안
└── design/
    ├── design-spec.md     # 하객 페이지 디자인 스펙
    ├── editor-spec.md     # 제작자(에디터) 디자인 스펙
    ├── tokens.json        # 디자인 토큰 (v1.1)
    └── assets/
        ├── icons/         # 아이콘 SVG (43개)
        └── envelope/      # 봉투 연출 SVG (6개)
```

## 빠른 링크

- **[MVP 최종 기획안](./planning/mvp-plan.md)** — 서비스 방향과 출시 범위의 확정본
- **[하객 페이지 디자인 스펙](./design/design-spec.md)** · **[제작자 스펙](./design/editor-spec.md)** · **[tokens.json](./design/tokens.json)**
# 하객 페이지

Next.js App Router. 초대장 `/i/*` 만 있다. 데이터는 `src/data` 의 `GuestDataSource` 뒤의 샘플 JSON 이고, `NEXT_PUBLIC_DATA_SOURCE=api` 로 바꾸면 같은 인터페이스가 API 를 본다.

```bash
npm install
npm test
npm run typecheck
npm run lint
npm run build
npm run dev
```

환경 변수는 `.env.example`. 키가 없어도 페이지는 뜨고, 지도·공유·Turnstile 만 스펙의 폴백으로 내려간다.

폰트는 `public/fonts` 에 둔다. KS X 1001 한글과 라틴, 그리고 `故`(U+6545) 만 넣었다. 라이선스는 `public/fonts/OFL.txt`.

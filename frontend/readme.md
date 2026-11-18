# 하객 페이지

Next.js App Router. 시작은 `/`, 테마 선택은 `/new`, 편집은 `/edit/[id]`, 하객 초대장은 `/i/*` 다. 하객 데이터는 `src/data` 의 `GuestDataSource` 뒤의 샘플 JSON 이고, `NEXT_PUBLIC_DATA_SOURCE=api` 로 바꾸면 같은 인터페이스가 API 를 본다.

```bash
npm install
npm test
npm run typecheck
npm run lint
npm run build
npm run dev
```

환경 변수는 `.env.example`. 키가 없어도 페이지는 뜨고, 지도·공유·Turnstile 만 스펙의 폴백으로 내려간다.

빌드는 초대장마다 `/i/{slug}/` 하나만 만든다. `/g/` 와 `/s/` 는 그 파일로 rewrite 한다. `next dev` 는 `next.config.ts`, Cloudflare Pages 는 `public/_redirects` 와 `public/_headers`, Vercel 은 `vercel.json` 을 본다. 리라이트와 Referrer-Policy·CSP 는 두 호스트가 같다. 자세한 표는 `docs/api/guest-data-contract.md`. 동적 청크 폴더의 대괄호는 빌드 뒤에 빼서, 그 경로를 거절하는 호스트에서도 클릭이 붙게 한다.

API는 `src/api/createInstance.ts` 로 만든 `src/api/clientInstance.ts` 와 `src/domain/<도메인>/query.ts` 훅이다. 화면은 그 훅만 부른다. 색·글자·간격·모서리는 `docs/design/tokens.json` 을 Tailwind 설정에 연결했다.

폰트는 `public/fonts` 에 둔다. KS X 1001 한글과 라틴, 그리고 `故`(U+6545) 만 넣었다. 라이선스는 `public/fonts/OFL.txt`.

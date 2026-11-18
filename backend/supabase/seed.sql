-- 마이그레이션이 private.app_settings 한 줄을 넣는다.
-- 데모 초대장(슬러그, 개인 토큰, 공용 RSVP 토큰)은 LINK_SECRET 해시와 맞아야 하므로
-- SQL 시드에 평문을 넣지 않는다. `npm run seed:demo` 를 쓴다.
-- static_rebuilds 는 발행·반영·발행 취소·삭제가 채운다. 시드 행은 없다.
select 1;

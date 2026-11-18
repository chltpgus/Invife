import { createInstance } from '@/api/createInstance';
import { env } from '@/env';

/** 앱 전역에서 이 인스턴스만 쓴다. 목/API 전환은 호출부가 목 클라이언트를 고르는 쪽에 있다. */
export const clientInstance = createInstance({
  baseUrl: env.apiBaseUrl,
  timeout: 20_000,
});

import type { AxiosRequestConfig } from 'axios';

export interface InstanceRequestConfig extends AxiosRequestConfig {
  skipAuth?: boolean;
}

export interface CreateInstanceOptions {
  baseUrl?: string;
  timeout?: number;
  headers?: AxiosRequestConfig['headers'];
}

export type RequestOptions = {
  query?: object;
  path?: Record<string, string | number>;
  headers?: AxiosRequestConfig['headers'];
  body?: unknown;
  signal?: AbortSignal;
  skipAuth?: boolean;
  timeout?: number;
};

export type ApiResult<T> = {
  status: number;
  data: T;
  retryAfter?: number;
  header: (name: string) => string | undefined;
};

/** 네트워크 실패. 409·429 는 계약상 응답이라 ApiResult 로 돌려준다. */
export class ApiError extends Error {
  status: number;
  body: unknown;
  retryAfter?: number;

  constructor(status: number, body: unknown, retryAfter?: number) {
    super(status ? `Request failed [${status}]` : 'Request failed');
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.retryAfter = retryAfter;
  }
}

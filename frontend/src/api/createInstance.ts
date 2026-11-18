import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { accessToken } from '@/api/auth';
import { ApiError, type ApiResult, type CreateInstanceOptions, type InstanceRequestConfig, type RequestOptions } from '@/api/instance/types';
import { headerValue, readRetryAfter, resolvePathParams, toQueryString } from '@/api/instance/utils';
import { env } from '@/env';

export type { ApiError, ApiResult, RequestOptions } from '@/api/instance/types';

export function createInstance(options: CreateInstanceOptions) {
  const instance = axios.create({
    baseURL: options.baseUrl ?? '',
    timeout: options.timeout ?? 20_000,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    paramsSerializer: toQueryString,
    validateStatus: () => true,
  });

  instance.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    const request = config as InstanceRequestConfig;
    if (request.skipAuth || env.dataSource !== 'api') return config;
    const token = await accessToken();
    if (token) config.headers.set('Authorization', `Bearer ${token}`);
    return config;
  });

  instance.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      const retryAfter = readRetryAfter(error.response?.headers as { [key: string]: unknown } | undefined);
      return Promise.reject(new ApiError(error.response?.status ?? 0, error.response?.data, retryAfter));
    },
  );

  async function request<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, requestOptions?: RequestOptions): Promise<ApiResult<T>> {
    const response = await instance.request<T>({
      url: resolvePathParams(url, requestOptions?.path),
      method,
      params: requestOptions?.query,
      data: requestOptions?.body,
      headers: requestOptions?.headers,
      signal: requestOptions?.signal,
      timeout: requestOptions?.timeout,
      skipAuth: requestOptions?.skipAuth,
    } as InstanceRequestConfig);
    const headers = response.headers as { [key: string]: unknown };
    return {
      status: response.status,
      data: response.data,
      retryAfter: response.status === 429 ? readRetryAfter(headers) : undefined,
      header: (name) => headerValue(headers, name),
    };
  }

  return {
    axios: instance as AxiosInstance,
    get: <T>(url: string, requestOptions?: RequestOptions) => request<T>('GET', url, requestOptions),
    post: <T>(url: string, requestOptions?: RequestOptions) => request<T>('POST', url, requestOptions),
    put: <T>(url: string, requestOptions?: RequestOptions) => request<T>('PUT', url, requestOptions),
    patch: <T>(url: string, requestOptions?: RequestOptions) => request<T>('PATCH', url, requestOptions),
    delete: <T>(url: string, requestOptions?: RequestOptions) => request<T>('DELETE', url, requestOptions),
    request,
  };
}

export default createInstance;

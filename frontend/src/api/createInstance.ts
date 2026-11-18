import axios, { type AxiosInstance, type CreateAxiosDefaults } from 'axios';

export function createInstance(config: CreateAxiosDefaults = {}): AxiosInstance {
  const { headers, ...rest } = config;
  return axios.create({
    ...rest,
    validateStatus: () => true,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

export const apiClient = createInstance();

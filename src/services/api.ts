import axios from 'axios';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Resolve API base URL priorizando env explícito (EXPO_PUBLIC_API_URL/API_URL) para apontar para o life-system
const getApiUrl = () => {
  // Variáveis de ambiente públicas do Expo (definidas em .env ou no comando de build)
  const envUrl =
    process.env.EXPO_PUBLIC_API_URL
    || process.env.API_URL;

  const extra =
    Constants.expoConfig?.extra
    || Constants.manifest?.extra
    || Constants.manifest2?.extra?.expoClient?.extra
    || {};

  const configuredBase =
    envUrl
    || extra.apiBaseUrl
    || extra.apiUrl;

  if (configuredBase) {
    return configuredBase;
  }

  if (__DEV__) {
    const debuggerHost =
      Constants.expoConfig?.hostUri?.split(':').shift()
      || Constants.manifest?.debuggerHost?.split(':').shift()
      || Constants.manifest2?.extra?.expoGo?.debuggerHost?.split(':').shift();

    if (debuggerHost) {
      return `http://${debuggerHost}:8000`;
    }

    if (Platform.OS === 'android') {
      return 'http://10.0.2.2:8000';
    }

    return 'http://localhost:8000';
  }

  // Fallback para produção quando nada foi configurado
  return 'https://api.lifeservicos.com';
};

const API_URL = getApiUrl();

console.log(`[API] Base URL: ${API_URL} (Platform: ${Platform.OS})`);

export const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Add bearer token when we have one (cookies are handled via withCredentials)
api.interceptors.request.use(
  async (config) => {
    const token = await SecureStore.getItemAsync('authToken');
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (__DEV__) {
      const method = config.method?.toUpperCase() || 'GET';
      console.log(`[API] ${method} ${config.baseURL}${config.url}`);
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - clear stale token on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync('authToken');
    }
    return Promise.reject(error);
  }
);

export default api;

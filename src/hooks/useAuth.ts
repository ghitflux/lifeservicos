import { useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api } from '../services/api';

interface User {
  id: string | number;
  email: string;
  name: string;
  role?: string;
  cpf?: string;
  phone?: string;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      // Tenta reaproveitar token bearer se existir, mas o backend usa cookies HttpOnly por padrão
      const token = await SecureStore.getItemAsync('authToken');
      if (!token) {
        await SecureStore.deleteItemAsync('authToken');
      }

      const response = await api.get('/auth/me');
      setUser(response.data);
    } catch (error) {
      await SecureStore.deleteItemAsync('authToken');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const response = await api.post('/auth/login', { email, password });

      // Se o backend algum dia retornar um bearer token no body, guardamos para reutilizar
      const possibleToken = (response.data as any)?.access_token;
      if (possibleToken) {
        await SecureStore.setItemAsync('authToken', possibleToken);
      } else {
        await SecureStore.deleteItemAsync('authToken');
      }

      // Garantir que temos os dados completos do usuário
      const userResponse = await api.get('/auth/me');
      setUser(userResponse.data);

      return { success: true };
    } catch (error: any) {
      let message = 'Erro ao fazer login';

      if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
        message = 'Erro de conexão. Verifique se o backend web está acessível.';
      } else if (error.response?.data?.detail) {
        message = error.response.data.detail;
      }

      return { success: false, error: message };
    }
  };

  const register = async (data: {
    name: string;
    email: string;
    password: string;
    cpf?: string;
    phone?: string;
    consent_credit_simulation?: boolean;
  }) => {
    try {
      await api.post('/mobile/register', data);
      return { success: true };
    } catch (error: any) {
      let message = 'Erro ao criar conta';

      if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
        message = 'Erro de conexão. Verifique se o backend web está acessível.';
      } else if (error.response?.data?.detail) {
        message = error.response.data.detail;
      }

      return { success: false, error: message };
    }
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout').catch(() => null);
      await SecureStore.deleteItemAsync('authToken');
      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return {
    user,
    loading,
    login,
    register,
    logout,
    isAuthenticated: !!user,
  };
}

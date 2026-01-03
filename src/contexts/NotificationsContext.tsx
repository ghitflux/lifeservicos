import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { api } from '@/services/api';

interface NotificationsContextValue {
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
  setUnreadCount: (count: number) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [unreadCount, setUnreadCountState] = useState(0);
  const refreshInFlight = useRef(false);

  const updateBadge = useCallback(async (count: number) => {
    try {
      await Notifications.setBadgeCountAsync(count);
    } catch {
      // Ignore badge errors on platforms that don't support it
    }
  }, []);

  const setUnreadCount = useCallback(
    (count: number) => {
      const safeCount = Math.max(0, count);
      setUnreadCountState(safeCount);
      updateBadge(safeCount);
    },
    [updateBadge]
  );

  const refreshUnreadCount = useCallback(async () => {
    if (refreshInFlight.current) {
      return;
    }
    refreshInFlight.current = true;
    try {
      const response = await api.get('/mobile/notifications');
      const data = response.data?.items || response.data || [];
      const list = Array.isArray(data) ? data : [];
      const count = list.filter((item: any) => !item?.is_read).length;
      setUnreadCount(count);
    } catch {
      // Keep last count if API is unavailable
    } finally {
      refreshInFlight.current = false;
    }
  }, [setUnreadCount]);

  useEffect(() => {
    refreshUnreadCount();
  }, [refreshUnreadCount]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshUnreadCount();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [refreshUnreadCount]);

  return (
    <NotificationsContext.Provider value={{ unreadCount, refreshUnreadCount, setUnreadCount }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotificationsContext() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotificationsContext must be used within a NotificationsProvider');
  }
  return context;
}

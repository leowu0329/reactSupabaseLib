import { create } from 'zustand';
import { supabase } from '../lib/supabase.js';
import { libraryService } from '../lib/libraryService.js';
import { ROLES, checkPermission } from '../config/permissions.js';

export const useLibraryStore = create((set, get) => ({
  // 認證與角色狀態
  user: null,
  profile: null,
  role: ROLES.GUEST,
  authLoading: true,

  // 館藏書目快取狀態
  books: [],
  booksLoading: false,

  // Realtime 即時通知佇列
  notifications: [],

  // 初始化或更新目前登入者與 RBAC 角色
  syncAuthSession: async (sessionUser) => {
    if (!sessionUser) {
      set({
        user: null,
        profile: null,
        role: ROLES.GUEST,
        authLoading: false,
      });
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', sessionUser.id)
      .maybeSingle();

    set({
      user: sessionUser,
      profile: profile || null,
      role: profile?.role || ROLES.MEMBER,
      authLoading: false,
    });
  },

  // 權限檢查輔助方法
  can: (permission) => {
    const currentRole = get().role;
    return checkPermission(currentRole, permission);
  },

  // 載入完整正規化書目與副本狀態
  fetchBooks: async () => {
    set({ booksLoading: true });
    try {
      const data = await libraryService.getBooksWithCopies();
      set({ books: data, booksLoading: false });
      return data;
    } catch (error) {
      set({ booksLoading: false });
      throw error;
    }
  },

  // 推入即時通知
  pushNotification: (notice) => {
    const item = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      read: false,
      ...notice,
    };
    set((state) => ({
      notifications: [item, ...state.notifications].slice(0, 20),
    }));
    return item;
  },

  // 標記所有通知為已讀
  markAllNotificationsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
    }));
  },
}));
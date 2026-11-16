import { create } from 'zustand';
import { supabase } from '../lib/supabase.js';
import { libraryService } from '../lib/libraryService.js';
import { extensibilityService } from '../lib/extensibilityService.js';
import { ROLES, checkPermission } from '../config/permissions.js';

export const useLibraryStore = create((set, get) => ({
  // 認證與角色狀態
  user: null,
  profile: null,
  role: ROLES.GUEST,
  authLoading: true,

  // 多分館切換狀態
  branches: [],
  activeBranchId: null,

  // 館藏書目與電子書快取狀態
  books: [],
  ebooks: [],
  aiRecommendations: [],
  booksLoading: false,

  // Realtime 即時通知佇列
  notifications: [],

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

  setBranches: (branches) => {
    const current = get().activeBranchId;
    set({
      branches,
      activeBranchId: current || branches?.[0]?.id || null,
    });
  },

  setActiveBranch: (branchId) => set({ activeBranchId: branchId }),

  can: (permission) => {
    const currentRole = get().role;
    return checkPermission(currentRole, permission);
  },

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

  loadAiRecommendations: async (memberId, customService = extensibilityService) => {
    const recs = await customService.getAiBookRecommendations(memberId);
    set({ aiRecommendations: recs });
    return recs;
  },

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

  markAllNotificationsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
    }));
  },
}));
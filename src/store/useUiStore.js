import { create } from 'zustand';

export const useUiStore = create((set, get) => ({
  sidebarCollapsed: false,
  mobileDrawerOpen: false,
  toasts: [],
  confirmDialog: {
    isOpen: false,
    title: '',
    message: '',
    confirmText: '確認執行',
    variant: 'danger',
    onConfirm: null,
  },

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setMobileDrawer: (isOpen) => set({ mobileDrawerOpen: isOpen }),

  showToast: (message, type = 'success', duration = 3500) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }],
    }));
    if (duration > 0) {
      setTimeout(() => {
        get().removeToast(id);
      }, duration);
    }
    return id;
  },

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  openConfirm: ({ title, message, confirmText = '確認執行', variant = 'danger', onConfirm }) =>
    set({
      confirmDialog: {
        isOpen: true,
        title,
        message,
        confirmText,
        variant,
        onConfirm,
      },
    }),

  closeConfirm: () =>
    set((state) => ({
      confirmDialog: { ...state.confirmDialog, isOpen: false, onConfirm: null },
    })),
}));
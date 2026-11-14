import { useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { useLibraryStore } from '../store/useLibraryStore.js';

/**
 * 角色與權限檢查自訂 Hook (RBAC Permission Hook)
 * 統一從 Zustand 全域狀態層讀取目前使用者的認證資訊與角色權限，
 * 避免多個元件同時掛載時重複向 Supabase 發送 profiles 查詢請求。
 *
 * @returns {{
 *   user: Object | null,
 *   role: string,
 *   loading: boolean,
 *   can: (permission: string) => boolean,
 *   refreshRole: () => Promise<void>
 * }}
 */
export function usePermission() {
  const user = useLibraryStore((state) => state.user);
  const role = useLibraryStore((state) => state.role);
  const loading = useLibraryStore((state) => state.authLoading);
  const can = useLibraryStore((state) => state.can);
  const syncAuthSession = useLibraryStore((state) => state.syncAuthSession);

  /**
   * 手動重新向 Supabase 同步最新登入狀態與角色資料
   * （例如管理員在後台調整角色後，強制刷新權限快取）
   */
  const refreshRole = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    await syncAuthSession(session?.user ?? null);
  }, [syncAuthSession]);

  return {
    user,
    role,
    loading,
    can,
    refreshRole,
  };
}
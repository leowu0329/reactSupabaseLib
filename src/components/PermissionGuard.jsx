import React from 'react';
import { usePermission } from '../hooks/usePermission';

/**
 * 宣告式權限保護元件
 * @param {string} permission - 需要的權限代碼，例如 'book.delete'
 * @param {React.ReactNode} fallback - 無權限時顯示的替代內容（預設為 null 隱藏）
 */
export default function PermissionGuard({ permission, fallback = null, children }) {
  const { can, loading } = usePermission();

  if (loading) return null;
  if (!can(permission)) return fallback;

  return <>{children}</>;
}
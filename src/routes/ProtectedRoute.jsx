import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useLibraryStore } from '../store/useLibraryStore';

/**
 * 路由權限守衛元件
 * @param {string} requiredPermission - 進入此頁面所需的權限代碼（選填）
 */
export default function ProtectedRoute({ requiredPermission, children }) {
  const user = useLibraryStore((state) => state.user);
  const authLoading = useLibraryStore((state) => state.authLoading);
  const can = useLibraryStore((state) => state.can);
  const location = useLocation();

  if (authLoading) {
    return (
      <div className="container py-5 text-center">
        <div className="spinner-border text-primary" role="status"></div>
      </div>
    );
  }

  // 未登入者導向登入頁並記錄來源路徑
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 已登入但權限不足者導回首頁
  if (requiredPermission && !can(requiredPermission)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
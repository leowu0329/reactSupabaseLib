import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { usePermission } from '../hooks/usePermission';
import { useLibraryStore } from '../store/useLibraryStore';
import { ROLE_LABELS } from '../config/permissions';

export default function Navbar() {
  const { user, role, can } = usePermission();
  const notifications = useLibraryStore((state) => state.notifications);
  const markAllNotificationsRead = useLibraryStore((state) => state.markAllNotificationsRead);
  const navigate = useNavigate();

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const canAccessAdmin =
    can('book.create') ||
    can('book.update') ||
    can('borrow.approve') ||
    can('system.settings');

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-dark px-4 mb-4">
      <Link className="navbar-brand fw-bold" to="/">
        <i className="fas fa-book-reader me-2"></i>雲端智慧圖書館
      </Link>

      <div className="collapse navbar-collapse">
        <ul className="navbar-nav me-auto">
          <li className="nav-item">
            <Link className="nav-link" to="/">公開書目查詢</Link>
          </li>

          {user && (
            <li className="nav-item">
              <Link className="nav-link" to="/my-borrows">我的借閱紀錄</Link>
            </li>
          )}

          {canAccessAdmin && (
            <li className="nav-item">
              <Link className="nav-link text-warning" to="/admin">
                <i className="fas fa-shield-alt me-1"></i>館務管理後台
              </Link>
            </li>
          )}
        </ul>

        <div className="d-flex align-items-center gap-3">
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm position-relative text-white"
            onClick={markAllNotificationsRead}
            title="點擊將即時通知標示為已讀"
          >
            <i className="fa-solid fa-bell"></i>
            {unreadCount > 0 && (
              <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">
                {unreadCount}
              </span>
            )}
          </button>

          <span className="badge bg-info text-dark">
            身份：{ROLE_LABELS[role] || role}
          </span>

          {user ? (
            <button className="btn btn-outline-light btn-sm" onClick={handleLogout}>
              登出 ({user.email})
            </button>
          ) : (
            <Link className="btn btn-primary btn-sm" to="/login">
              登入系統
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
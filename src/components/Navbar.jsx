import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { usePermission } from '../hooks/usePermission';
import { ROLE_LABELS } from '../config/permissions';

export default function Navbar() {
  const { user, role, can } = usePermission();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  // 具備書籍新增/修改、借閱審核或系統設定權限者可進入後台管理
  const canAccessAdmin =
    can('book.create') ||
    can('book.update') ||
    can('borrow.approve') ||
    can('system.settings');

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-dark px-4">
      <Link className="navbar-brand fw-bold" to="/">
        <i className="fas fa-book-reader me-2"></i>圖書館管理系統
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
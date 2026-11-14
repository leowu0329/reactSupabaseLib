import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Navbar({ user, profile }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-dark shadow-sm mb-4">
      <div className="container">
        <Link className="navbar-brand fw-bold" to="/">
          <i className="fa-solid fa-book-open-reader me-2 text-info"></i>
          智慧圖書館
        </Link>
        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navbarNav"
        >
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className="collapse navbar-collapse" id="navbarNav">
          <ul className="navbar-nav me-auto">
            <li className="nav-item">
              <Link className="nav-link" to="/">
                <i className="fa-solid fa-magnifying-glass me-1"></i> 館藏查詢
              </Link>
            </li>
            {user && (
              <li className="nav-item">
                <Link className="nav-link" to="/my-borrows">
                  <i className="fa-solid fa-bookmark me-1"></i> 我的借閱
                </Link>
              </li>
            )}
            {profile?.role === 'admin' && (
              <li className="nav-item">
                <Link className="nav-link text-warning fw-medium" to="/admin">
                  <i className="fa-solid fa-screwdriver-wrench me-1"></i> 館員後台管理
                </Link>
              </li>
            )}
          </ul>
          <div className="d-flex align-items-center">
            {user ? (
              <>
                <span className="text-light me-3 small">
                  <i className="fa-solid fa-user-circle me-1"></i>
                  {profile?.full_name || user.email}
                  {profile?.role === 'admin' && (
                    <span className="badge bg-warning text-dark ms-2">管理員</span>
                  )}
                </span>
                <button className="btn btn-outline-light btn-sm" onClick={handleLogout}>
                  <i className="fa-solid fa-right-from-bracket me-1"></i> 登出
                </button>
              </>
            ) : (
              <Link className="btn btn-info btn-sm fw-medium" to="/login">
                <i className="fa-solid fa-right-to-bracket me-1"></i> 登入 / 註冊
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
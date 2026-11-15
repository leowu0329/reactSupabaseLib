import React, { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ADMIN_MENU_CONFIG } from '../config/menuConfig';
import { useUiStore } from '../store/useUiStore';
import ConfirmModal from '../components/ConfirmModal';
import ToastContainer from '../components/ToastContainer';

export default function AdminLayout() {
  const location = useLocation();
  const { sidebarCollapsed, toggleSidebar, mobileDrawerOpen, setMobileDrawer } = useUiStore();
  const [expandedGroups, setExpandedGroups] = useState({
    catalog: true,
    circulation: true,
  });

  const toggleGroup = (key) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="admin-wrapper d-flex min-vh-100 bg-light">
      {/* 手機版背景遮罩 */}
      {mobileDrawerOpen && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-50 d-lg-none"
          style={{ zIndex: 1040 }}
          onClick={() => setMobileDrawer(false)}
        />
      )}

      {/* Sidebar 側邊導航欄 */}
      <aside
        className={`admin-sidebar bg-dark text-white d-flex flex-column ${
          sidebarCollapsed ? 'collapsed' : ''
        } ${mobileDrawerOpen ? 'mobile-open' : ''}`}
      >
        <div className="sidebar-brand d-flex align-items-center justify-content-between px-3 py-3 border-bottom border-secondary">
          <div className="d-flex align-items-center gap-2 overflow-hidden">
            <i className="bi bi-journal-bookmark-fill fs-4 text-info" />
            {!sidebarCollapsed && <span className="fw-bold text-nowrap">Library System</span>}
          </div>
          <button
            className="btn btn-sm btn-outline-light d-lg-none"
            onClick={() => setMobileDrawer(false)}
            aria-label="關閉選單"
          >
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <nav className="flex-grow-1 overflow-auto py-2" aria-label="後台主選單">
          <ul className="nav flex-column px-2 gap-1">
            {ADMIN_MENU_CONFIG.map((item) => {
              if (!item.children) {
                return (
                  <li className="nav-item" key={item.key}>
                    <NavLink
                      to={item.path}
                      end
                      onClick={() => setMobileDrawer(false)}
                      className={({ isActive }) =>
                        `nav-link text-white d-flex align-items-center gap-2 rounded ${
                          isActive ? 'bg-primary fw-semibold' : 'text-white-50'
                        }`
                      }
                    >
                      <i className={`bi ${item.icon}`} />
                      {!sidebarCollapsed && <span>{item.label}</span>}
                    </NavLink>
                  </li>
                );
              }

              const isGroupActive = item.children.some((c) => location.pathname.startsWith(c.path));
              const isExpanded = expandedGroups[item.key] ?? isGroupActive;

              return (
                <li className="nav-item" key={item.key}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(item.key)}
                    className={`btn w-100 text-start d-flex align-items-center justify-content-between px-3 py-2 border-0 ${
                      isGroupActive ? 'text-white fw-semibold' : 'text-white-50'
                    }`}
                  >
                    <span className="d-flex align-items-center gap-2">
                      <i className={`bi ${item.icon}`} />
                      {!sidebarCollapsed && <span>{item.label}</span>}
                    </span>
                    {!sidebarCollapsed && (
                      <i className={`bi ${isExpanded ? 'bi-chevron-down' : 'bi-chevron-right'} small`} />
                    )}
                  </button>

                  {!sidebarCollapsed && isExpanded && (
                    <ul className="nav flex-column ps-4 mt-1 gap-1">
                      {item.children.map((sub) => (
                        <li className="nav-item" key={sub.key}>
                          <NavLink
                            to={sub.path}
                            onClick={() => setMobileDrawer(false)}
                            className={({ isActive }) =>
                              `nav-link py-1 px-2 rounded small ${
                                isActive ? 'bg-primary text-white fw-semibold' : 'text-white-50'
                              }`
                            }
                          >
                            {sub.label}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* 右側 Header + Main Content */}
      <div className="flex-grow-1 d-flex flex-column min-w-0">
        <header className="admin-header bg-white border-bottom px-3 px-md-4 py-2 d-flex align-items-center justify-content-between sticky-top">
          <div className="d-flex align-items-center gap-2">
            {/* 手機版開啟抽屜按鈕 */}
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm d-lg-none"
              onClick={() => setMobileDrawer(true)}
              aria-label="開啟側邊欄"
            >
              <i className="bi bi-list fs-5" />
            </button>
            {/* 桌面版收合按鈕 */}
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm d-none d-lg-inline-flex"
              onClick={toggleSidebar}
              aria-label="切換側邊欄寬度"
            >
              <i className="bi bi-layout-sidebar" />
            </button>
            <span className="text-muted small d-none sm-inline">Library Management System 後台管理</span>
          </div>

          <div className="d-flex align-items-center gap-3">
            <NavLink to="/admin/circulation/checkout" className="btn btn-sm btn-primary">
              <i className="bi bi-upc-scan me-1" />
              快速借還工作台
            </NavLink>
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-person-circle fs-5 text-secondary" />
              <span className="small fw-medium">館員管理端</span>
            </div>
          </div>
        </header>

        <main className="flex-grow-1 p-3 p-md-4">
          <Outlet />
        </main>
      </div>

      <ConfirmModal />
      <ToastContainer />
    </div>
  );
}
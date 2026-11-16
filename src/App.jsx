import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout from './layouts/AdminLayout';
import AdminDashboard from './pages/AdminDashboard';
import CirculationDesk from './pages/CirculationDesk';
import SelfServiceKiosk from './pages/SelfServiceKiosk';
import CatalogManagement from './pages/admin/CatalogManagement';
import MemberManagement from './pages/admin/MemberManagement';
import InventoryManager from './pages/admin/InventoryManager';
import ExtensibilityManager from './pages/admin/ExtensibilityManager';
import {
  ReservationManager,
  OverdueFineManager,
  ProcurementManager,
  AnalyticsReports,
  SystemSettings,
  GenericModuleListView,
} from './pages/admin/ModuleViews';
import CopyStateBadge from './components/CopyStateBadge';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route path="/kiosk" element={<SelfServiceKiosk />} />

        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />

          {/* 圖書管理 */}
          <Route path="catalog/books" element={<CatalogManagement activeTab="books" />} />
          <Route path="catalog/books/new" element={<CatalogManagement activeTab="book-create" />} />
          <Route path="catalog/categories" element={<CatalogManagement activeTab="categories" />} />
          <Route path="catalog/authors" element={<CatalogManagement activeTab="authors" />} />
          <Route path="catalog/publishers" element={<CatalogManagement activeTab="publishers" />} />
          <Route path="catalog/copies" element={<CatalogManagement activeTab="copies" />} />

          {/* 讀者管理 */}
          <Route path="members/list" element={<MemberManagement activeTab="member-list" />} />
          <Route path="members/new" element={<MemberManagement activeTab="member-create" />} />
          <Route path="members/cards" element={<MemberManagement activeTab="member-cards" />} />
          <Route path="members/history" element={<MemberManagement activeTab="member-history" />} />

          {/* 借閱管理 */}
          <Route path="circulation/checkout" element={<CirculationDesk defaultMode="checkout" />} />
          <Route path="circulation/checkin" element={<CirculationDesk defaultMode="checkin" />} />
          <Route
            path="circulation/renew"
            element={
              <GenericModuleListView
                title="借閱管理 - 續借管理"
                columns={[
                  { key: 'barcode', label: '館藏條碼' },
                  { key: 'title', label: '書名' },
                  { key: 'member', label: '借閱人' },
                  { key: 'due_date', label: '應還日期' },
                  { key: 'status', label: '狀態', render: (v) => <CopyStateBadge status={v} /> },
                ]}
              />
            }
          />
          <Route
            path="circulation/records"
            element={
              <GenericModuleListView
                title="借閱管理 - 借閱紀錄"
                columns={[
                  { key: 'barcode', label: '館藏條碼' },
                  { key: 'title', label: '書名' },
                  { key: 'member', label: '借閱人' },
                  { key: 'borrowed_at', label: '借出日期' },
                  { key: 'status', label: '狀態', render: (v) => <CopyStateBadge status={v} /> },
                ]}
              />
            }
          />

          {/* 智慧擴充中心 */}
          <Route path="extensibility/branches" element={<ExtensibilityManager activeTab="ext-branches" />} />
          <Route path="extensibility/rfid" element={<ExtensibilityManager activeTab="ext-rfid" />} />
          <Route path="extensibility/ebooks" element={<ExtensibilityManager activeTab="ext-ebooks" />} />
          <Route path="extensibility/notifications" element={<ExtensibilityManager activeTab="ext-notifications" />} />
          <Route path="extensibility/ai-recommend" element={<ExtensibilityManager activeTab="ext-ai" />} />

          {/* 預約、逾期、採購、盤點、報表、系統設定 */}
          <Route path="reservations/list" element={<ReservationManager activeTab="res-list" />} />
          <Route path="reservations/waitlist" element={<ReservationManager activeTab="res-waitlist" />} />
          <Route path="reservations/notifications" element={<ReservationManager activeTab="res-notify" />} />
          <Route path="overdue/list" element={<OverdueFineManager activeTab="overdue-list" />} />
          <Route path="overdue/fines" element={<OverdueFineManager activeTab="fines" />} />
          <Route path="overdue/payments" element={<OverdueFineManager activeTab="payments" />} />
          <Route path="procurement/requests" element={<ProcurementManager activeTab="proc-requests" />} />
          <Route path="procurement/orders" element={<ProcurementManager activeTab="proc-orders" />} />
          <Route path="procurement/receive" element={<ProcurementManager activeTab="proc-receive" />} />
          <Route path="inventory/audit" element={<InventoryManager activeTab="inv-audit" />} />
          <Route path="inventory/lost" element={<InventoryManager activeTab="inv-lost" />} />
          <Route path="inventory/discard" element={<InventoryManager activeTab="inv-discard" />} />
          <Route path="analytics/borrows" element={<AnalyticsReports activeTab="stat-borrow" />} />
          <Route path="analytics/collection" element={<AnalyticsReports activeTab="stat-collection" />} />
          <Route path="analytics/members" element={<AnalyticsReports activeTab="stat-member" />} />
          <Route path="analytics/overdue" element={<AnalyticsReports activeTab="stat-overdue" />} />
          <Route path="settings/users" element={<SystemSettings activeTab="set-users" />} />
          <Route path="settings/roles" element={<SystemSettings activeTab="set-roles" />} />
          <Route path="settings/rules" element={<SystemSettings activeTab="set-rules" />} />
          <Route path="settings/notifications" element={<SystemSettings activeTab="set-notify" />} />
          <Route path="settings/audit-logs" element={<SystemSettings activeTab="set-audit" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
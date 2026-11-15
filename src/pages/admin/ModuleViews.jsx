// src/pages/admin/ModuleViews.jsx
import React from 'react';
import DataTable from '../../components/DataTable';
import CopyStateBadge from '../../components/CopyStateBadge';

export function GenericModuleListView({ title, columns, data = [], searchPlaceholder }) {
  return (
    <div>
      <h4 className="fw-bold mb-3">{title}</h4>
      <DataTable columns={columns} data={data} searchPlaceholder={searchPlaceholder} />
    </div>
  );
}

export function ReservationManager({ activeTab }) {
  const titles = {
    'res-list': '預約清單',
    'res-waitlist': '候補清單',
    'res-notify': '預約通知紀錄',
  };
  return (
    <GenericModuleListView
      title={`預約管理 - ${titles[activeTab] || '總覽'}`}
      searchPlaceholder="搜尋預約人或書名..."
      columns={[
        { key: 'id', label: '預約編號' },
        { key: 'book_title', label: '預約書名' },
        { key: 'member_name', label: '讀者姓名' },
        { key: 'status', label: '狀態', render: (v) => <CopyStateBadge status={v} /> },
      ]}
    />
  );
}

export function OverdueFineManager({ activeTab }) {
  const titles = {
    'overdue-list': '逾期清單',
    fines: '罰款管理',
    payments: '繳費紀錄',
  };
  return (
    <GenericModuleListView
      title={`逾期與罰款 - ${titles[activeTab] || '總覽'}`}
      searchPlaceholder="搜尋讀者或逾期書目..."
      columns={[
        { key: 'member_name', label: '讀者姓名' },
        { key: 'book_title', label: '逾期書名' },
        { key: 'overdue_days', label: '逾期天數' },
        { key: 'amount', label: '罰款金額 (NT$)' },
        { key: 'status', label: '狀態', render: (v) => <CopyStateBadge status={v} /> },
      ]}
    />
  );
}

export function ProcurementManager({ activeTab }) {
  const titles = {
    'proc-requests': '採購申請',
    'proc-orders': '訂單管理',
    'proc-receive': '入庫驗收',
  };
  return (
    <GenericModuleListView
      title={`採購管理 - ${titles[activeTab] || '總覽'}`}
      searchPlaceholder="搜尋採購單號或書商..."
      columns={[
        { key: 'order_no', label: '採購單號' },
        { key: 'vendor', label: '供應商' },
        { key: 'item_count', label: '冊數' },
        { key: 'status', label: '進度狀態', render: (v) => <CopyStateBadge status={v} /> },
      ]}
    />
  );
}

export function AnalyticsReports({ activeTab }) {
  const titles = {
    'stat-borrow': '借閱統計報表',
    'stat-collection': '館藏統計報表',
    'stat-member': '讀者統計報表',
    'stat-overdue': '逾期統計報表',
  };
  return (
    <GenericModuleListView
      title={`報表分析 - ${titles[activeTab] || '統計總覽'}`}
      searchPlaceholder="篩選統計維度或期間..."
      columns={[
        { key: 'period', label: '統計區間' },
        { key: 'category', label: '分類維度' },
        { key: 'count', label: '累計數量' },
        { key: 'growth', label: '較前期成長率' },
      ]}
    />
  );
}

export function SystemSettings({ activeTab }) {
  const titles = {
    'set-users': '後台使用者管理',
    'set-roles': '角色與權限配置',
    'set-rules': '借閱天數與冊數規則',
    'set-notify': '自動化通知設定',
    'set-audit': '系統操作稽核紀錄',
  };
  return (
    <GenericModuleListView
      title={`系統設定 - ${titles[activeTab] || '系統配置'}`}
      searchPlaceholder="搜尋操作人員、角色或規則..."
      columns={[
        { key: 'name', label: '項目 / 人員' },
        { key: 'detail', label: '設定內容 / 動作' },
        { key: 'updated_at', label: '最後更新時間' },
      ]}
    />
  );
}
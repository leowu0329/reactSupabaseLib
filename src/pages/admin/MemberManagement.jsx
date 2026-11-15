// src/pages/admin/MemberManagement.jsx
import React, { useState, useEffect } from 'react';
import DataTable from '../../components/DataTable';
import CopyStateBadge from '../../components/CopyStateBadge';
import { fetchMembers, suspendMember } from '../../lib/memberService';
import { useUiStore } from '../../store/useUiStore';

export default function MemberManagement({ activeTab = 'member-list' }) {
  const [members, setMembers] = useState([]);
  const { showToast, openConfirm } = useUiStore();

  useEffect(() => {
    fetchMembers().then((res) => setMembers(res || [])).catch(() => setMembers([]));
  }, [activeTab]);

  const handleSuspend = (member) => {
    openConfirm({
      title: '確認停權讀者帳號',
      message: `確定要將讀者「${member.name}」（證號：${member.card_number}）停權嗎？停權期間將無法借閱或預約圖書。`,
      confirmText: '確認停權',
      variant: 'danger',
      onConfirm: async () => {
        await suspendMember(member.id);
        setMembers((prev) =>
          prev.map((m) => (m.id === member.id ? { ...m, status: 'suspended' } : m))
        );
        showToast(`讀者 ${member.name} 已停權`, 'warning');
      },
    });
  };

  const columns = [
    { key: 'card_number', label: '讀者證號' },
    { key: 'name', label: '姓名' },
    { key: 'email', label: '電子郵件' },
    {
      key: 'status',
      label: '帳戶狀態',
      render: (val) => <CopyStateBadge status={val || 'active'} />,
    },
  ];

  return (
    <div>
      <h4 className="fw-bold mb-3">讀者管理 ({activeTab})</h4>
      <DataTable
        columns={columns}
        data={members}
        searchPlaceholder="搜尋讀者姓名、證號或信箱..."
        renderRowActions={(row) =>
          row.status !== 'suspended' && (
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
              onClick={() => handleSuspend(row)}
            >
              停權
            </button>
          )
        }
      />
    </div>
  );
}
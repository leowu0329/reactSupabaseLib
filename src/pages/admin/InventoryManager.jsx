// src/pages/admin/InventoryManager.jsx
import React, { useState } from 'react';
import DataTable from '../../components/DataTable';
import CopyStateBadge from '../../components/CopyStateBadge';
import { transitionCopyState } from '../../config/copyStateMachine';
import { useUiStore } from '../../store/useUiStore';

export default function InventoryManager({ activeTab = 'inv-discard', initialCopies = [] }) {
  const [copies, setCopies] = useState(initialCopies);
  const { showToast, openConfirm } = useUiStore();

  const handleDiscard = (copy) => {
    openConfirm({
      title: '確認館藏報廢',
      message: `確定要將館藏條碼「${copy.barcode}」（${copy.title}）執行報廢嗎？報廢後狀態將不可逆轉。`,
      confirmText: '確認報廢',
      variant: 'danger',
      onConfirm: async () => {
        const nextState = transitionCopyState(copy.status, 'DISCARD');
        setCopies((prev) =>
          prev.map((c) => (c.id === copy.id ? { ...c, status: nextState } : c))
        );
        showToast(`館藏 ${copy.barcode} 已完成報廢程序`, 'success');
      },
    });
  };

  const columns = [
    { key: 'barcode', label: '館藏條碼' },
    { key: 'title', label: '書名' },
    {
      key: 'status',
      label: '目前狀態',
      render: (val) => <CopyStateBadge status={val} />,
    },
  ];

  return (
    <div>
      <h4 className="fw-bold mb-3">館藏盤點與報廢 ({activeTab})</h4>
      <DataTable
        columns={columns}
        data={copies}
        searchPlaceholder="搜尋條碼或書名..."
        renderRowActions={(row) =>
          row.status !== 'discarded' && (
            <button
              type="button"
              className="btn btn-sm btn-outline-dark"
              onClick={() => handleDiscard(row)}
            >
              報廢
            </button>
          )
        }
      />
    </div>
  );
}
import React from 'react';

const STATUS_MAP = {
  // 館藏副本狀態
  available: { label: '可借閱', color: 'success' },
  checked_out: { label: '已借出', color: 'primary' },
  reserved: { label: '已預約', color: 'warning' },
  in_transit: { label: '調撥中', color: 'info' },
  maintenance: { label: '修補中', color: 'secondary' },
  lost: { label: '已遺失', color: 'danger' },
  discarded: { label: '已報廢', color: 'dark' },

  // 讀者與帳戶狀態
  active: { label: '正常啟用', color: 'success' },
  suspended: { label: '已停權', color: 'danger' },
  expired: { label: '已過期', color: 'secondary' },

  // 借閱、預約與罰款狀態
  borrowed: { label: '借閱中', color: 'primary' },
  returned: { label: '已歸還', color: 'success' },
  overdue: { label: '已逾期', color: 'danger' },
  pending: { label: '等待中', color: 'warning' },
  notified: { label: '已通知取書', color: 'info' },
  paid: { label: '已繳清', color: 'success' },
  unpaid: { label: '未繳納', color: 'danger' },
  approved: { label: '已核准', color: 'success' },
  received: { label: '已驗收', color: 'success' },
};

export default function CopyStateBadge({ status }) {
  const config = STATUS_MAP[status] || { label: status || '未知', color: 'secondary' };
  return (
    <span className={`badge rounded-pill bg-${config.color} px-2 py-1`}>
      {config.label}
    </span>
  );
}
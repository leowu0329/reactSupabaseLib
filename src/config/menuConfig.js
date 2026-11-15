export const ADMIN_MENU_CONFIG = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: 'bi-speedometer2',
    path: '/admin',
  },
  {
    key: 'catalog',
    label: '圖書管理',
    icon: 'bi-book',
    children: [
      { key: 'books', label: '圖書清單', path: '/admin/catalog/books' },
      { key: 'book-create', label: '新增圖書', path: '/admin/catalog/books/new' },
      { key: 'categories', label: '圖書分類', path: '/admin/catalog/categories' },
      { key: 'authors', label: '作者管理', path: '/admin/catalog/authors' },
      { key: 'publishers', label: '出版社管理', path: '/admin/catalog/publishers' },
      { key: 'copies', label: '館藏副本', path: '/admin/catalog/copies' },
    ],
  },
  {
    key: 'members',
    label: '讀者管理',
    icon: 'bi-people',
    children: [
      { key: 'member-list', label: '讀者清單', path: '/admin/members/list' },
      { key: 'member-create', label: '新增讀者', path: '/admin/members/new' },
      { key: 'member-cards', label: '讀者證', path: '/admin/members/cards' },
      { key: 'member-history', label: '讀者借閱歷史', path: '/admin/members/history' },
    ],
  },
  {
    key: 'circulation',
    label: '借閱管理',
    icon: 'bi-arrow-left-right',
    children: [
      { key: 'checkout', label: '圖書借出', path: '/admin/circulation/checkout' },
      { key: 'checkin', label: '圖書歸還', path: '/admin/circulation/checkin' },
      { key: 'renew', label: '續借管理', path: '/admin/circulation/renew' },
      { key: 'records', label: '借閱紀錄', path: '/admin/circulation/records' },
    ],
  },
  {
    key: 'reservations',
    label: '預約管理',
    icon: 'bi-bookmark-check',
    children: [
      { key: 'res-list', label: '預約清單', path: '/admin/reservations/list' },
      { key: 'res-waitlist', label: '候補清單', path: '/admin/reservations/waitlist' },
      { key: 'res-notify', label: '預約通知', path: '/admin/reservations/notifications' },
    ],
  },
  {
    key: 'overdue',
    label: '逾期管理',
    icon: 'bi-exclamation-triangle',
    children: [
      { key: 'overdue-list', label: '逾期清單', path: '/admin/overdue/list' },
      { key: 'fines', label: '罰款管理', path: '/admin/overdue/fines' },
      { key: 'payments', label: '繳費紀錄', path: '/admin/overdue/payments' },
    ],
  },
  {
    key: 'procurement',
    label: '採購管理',
    icon: 'bi-cart-plus',
    children: [
      { key: 'proc-requests', label: '採購申請', path: '/admin/procurement/requests' },
      { key: 'proc-orders', label: '訂單管理', path: '/admin/procurement/orders' },
      { key: 'proc-receive', label: '入庫驗收', path: '/admin/procurement/receive' },
    ],
  },
  {
    key: 'inventory',
    label: '館藏盤點',
    icon: 'bi-upc-scan',
    children: [
      { key: 'inv-audit', label: '盤點作業', path: '/admin/inventory/audit' },
      { key: 'inv-lost', label: '遺失管理', path: '/admin/inventory/lost' },
      { key: 'inv-discard', label: '報廢管理', path: '/admin/inventory/discard' },
    ],
  },
  {
    key: 'analytics',
    label: '報表分析',
    icon: 'bi-bar-chart-line',
    children: [
      { key: 'stat-borrow', label: '借閱統計', path: '/admin/analytics/borrows' },
      { key: 'stat-collection', label: '館藏統計', path: '/admin/analytics/collection' },
      { key: 'stat-member', label: '讀者統計', path: '/admin/analytics/members' },
      { key: 'stat-overdue', label: '逾期統計', path: '/admin/analytics/overdue' },
    ],
  },
  {
    key: 'settings',
    label: '系統設定',
    icon: 'bi-gear',
    children: [
      { key: 'set-users', label: '使用者管理', path: '/admin/settings/users' },
      { key: 'set-roles', label: '角色權限', path: '/admin/settings/roles' },
      { key: 'set-rules', label: '借閱規則', path: '/admin/settings/rules' },
      { key: 'set-notify', label: '通知設定', path: '/admin/settings/notifications' },
      { key: 'set-audit', label: '操作紀錄', path: '/admin/settings/audit-logs' },
    ],
  },
];
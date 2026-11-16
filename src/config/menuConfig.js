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
      { key: 'book-create', label: '新增圖書 (支援 ISBN API)', path: '/admin/catalog/books/new' },
      { key: 'categories', label: '圖書分類', path: '/admin/catalog/categories' },
      { key: 'authors', label: '作者管理', path: '/admin/catalog/authors' },
      { key: 'publishers', label: '出版社管理', path: '/admin/catalog/publishers' },
      { key: 'copies', label: '館藏副本 (RFID/QR)', path: '/admin/catalog/copies' },
    ],
  },
  {
    key: 'members',
    label: '讀者管理',
    icon: 'bi-people',
    children: [
      { key: 'member-list', label: '讀者清單', path: '/admin/members/list' },
      { key: 'member-create', label: '新增讀者', path: '/admin/members/new' },
      { key: 'member-cards', label: '數位 QR 讀者證', path: '/admin/members/cards' },
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
      { key: 'records', label: '借閱紀錄 (不可刪除)', path: '/admin/circulation/records' },
    ],
  },
  {
    key: 'extensibility',
    label: '智慧擴充中心',
    icon: 'bi-cpu',
    children: [
      { key: 'ext-branches', label: '多分館與跨館調撥', path: '/admin/extensibility/branches' },
      { key: 'ext-rfid', label: 'RFID 盤點作業', path: '/admin/extensibility/rfid' },
      { key: 'ext-ebooks', label: '電子書資源管理', path: '/admin/extensibility/ebooks' },
      { key: 'ext-notifications', label: 'Email / LINE 通知中心', path: '/admin/extensibility/notifications' },
      { key: 'ext-ai', label: 'AI 智慧閱讀推薦', path: '/admin/extensibility/ai-recommend' },
      { key: 'ext-kiosk', label: '自助借還機模式 (Kiosk)', path: '/kiosk' },
    ],
  },
];
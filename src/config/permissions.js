export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  LIBRARIAN_ADMIN: 'librarian_admin',
  LIBRARIAN: 'librarian',
  PROCUREMENT: 'procurement',
  MEMBER: 'member',
  GUEST: 'guest',
};

export const ROLE_LABELS = {
  [ROLES.SUPER_ADMIN]: '超級管理員 (Super Admin)',
  [ROLES.LIBRARIAN_ADMIN]: '館長 (Librarian Admin)',
  [ROLES.LIBRARIAN]: '圖書館員 (Librarian)',
  [ROLES.PROCUREMENT]: '採購人員 (Procurement)',
  [ROLES.MEMBER]: '讀者 (Member)',
  [ROLES.GUEST]: '訪客 (Guest)',
};

export const ROLE_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: {
    'book.read': true,
    'book.create': true,
    'book.update': true,
    'book.delete': true,
    'borrow.create': true,
    'borrow.return': true,
    'borrow.approve': true,
    'system.settings': true,
    'audit.read': true,
  },
  [ROLES.LIBRARIAN_ADMIN]: {
    'book.read': true,
    'book.create': true,
    'book.update': true,
    'book.delete': true,
    'borrow.create': true,
    'borrow.return': true,
    'borrow.approve': true,
    'system.settings': false,
    'audit.read': true,
  },
  [ROLES.LIBRARIAN]: {
    'book.read': true,
    'book.create': true,
    'book.update': true,
    'book.delete': false,
    'borrow.create': true,
    'borrow.return': true,
    'borrow.approve': true,
    'system.settings': false,
    'audit.read': false,
  },
  [ROLES.PROCUREMENT]: {
    'book.read': true,
    'book.create': true,
    'book.update': true,
    'book.delete': false,
    'borrow.create': false,
    'borrow.return': false,
    'borrow.approve': false,
    'system.settings': false,
    'audit.read': false,
  },
  [ROLES.MEMBER]: {
    'book.read': true,
    'book.create': false,
    'book.update': false,
    'book.delete': false,
    'borrow.create': true,
    'borrow.return': false,
    'borrow.approve': false,
    'system.settings': false,
    'audit.read': false,
  },
  [ROLES.GUEST]: {
    'book.read': true,
    'book.create': false,
    'book.update': false,
    'book.delete': false,
    'borrow.create': false,
    'borrow.return': false,
    'borrow.approve': false,
    'system.settings': false,
    'audit.read': false,
  },
};

export function checkPermission(role, permission) {
  const effectiveRole = role && ROLE_PERMISSIONS[role] ? role : ROLES.GUEST;
  return Boolean(ROLE_PERMISSIONS[effectiveRole]?.[permission]);
}
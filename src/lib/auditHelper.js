import crypto from 'node:crypto';

/**
 * 不可任意刪除的歷史與稽核資料表白名單
 * 這些資料表禁止執行 hardDelete 或 softDelete，僅允許新增 (Append-Only) 或狀態追加
 */
export const IMMUTABLE_HISTORY_TABLES = new Set([
  'borrow_records',
  'loans',
  'loan_items',
  'payments',
  'audit_logs',
  'rfid_scan_logs',
  'ebook_loans',
  'notification_logs',
]);

/**
 * 支援軟刪除的核心主檔資料表
 */
export const SOFT_DELETABLE_TABLES = new Set([
  'branches',
  'shelves',
  'books',
  'book_copies',
  'members',
  'publishers',
  'categories',
  'authors',
  'ebooks',
  'interlibrary_transfers',
]);

/**
 * 產生標準核心預留欄位 (id, created_at, updated_at, created_by, updated_by, deleted_at)
 */
export function withCoreAuditFields(payload, { actorId = null, isUpdate = false, supportsSoftDelete = true } = {}) {
  const now = new Date().toISOString();

  if (isUpdate) {
    const { id, created_at, created_by, ...rest } = payload;
    return {
      ...rest,
      updated_at: now,
      updated_by: actorId || payload.updated_by || null,
    };
  }

  const base = {
    id: payload.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    ...payload,
    created_at: payload.created_at || now,
    updated_at: payload.updated_at || now,
    created_by: payload.created_by || actorId || null,
    updated_by: payload.updated_by || actorId || null,
  };

  if (supportsSoftDelete && !('deleted_at' in base)) {
    base.deleted_at = null;
  }

  return base;
}

/**
 * 執行受控刪除檢查：
 * - 若為借閱、繳費、稽核等歷史表，強制拋出異常禁止刪除
 * - 若為一般核心主檔，標記 deleted_at 執行軟刪除
 */
export function buildSafeDeletePatch(tableName, record, actorId = null) {
  if (IMMUTABLE_HISTORY_TABLES.has(tableName)) {
    throw new Error(`安全稽核阻擋：資料表 [${tableName}] 為不可刪除的歷史紀錄，嚴禁刪除或軟刪除！`);
  }
  if (!SOFT_DELETABLE_TABLES.has(tableName)) {
    throw new Error(`未定義刪除策略的資料表：[${tableName}]`);
  }
  if (record?.deleted_at) {
    throw new Error(`資料表 [${tableName}] 該筆資料已於 ${record.deleted_at} 軟刪除`);
  }

  const now = new Date().toISOString();
  return {
    ...record,
    deleted_at: now,
    updated_at: now,
    updated_by: actorId || record?.updated_by || null,
  };
}

/**
 * 過濾尚未被軟刪除的有效資料
 */
export function filterActiveRecords(records = []) {
  return records.filter((item) => !item?.deleted_at);
}
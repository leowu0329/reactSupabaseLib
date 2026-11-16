// test/roadmap_phased_e2e.test.js
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  LMS_ROADMAP_PHASES,
  verifyPhaseReadiness,
  calculateRoadmapProgress,
} from '../src/lib/roadmapService.js';

/**
 * 模擬具備完整關聯狀態的 Supabase 後端引擎與前端狀態 Store
 * 用於驗證每一個 Phase 都能獨立執行、寫入、讀取與狀態轉移
 */
function createIntegratedLmsSimulator() {
  const db = {
    roles: [
      { id: 'r-admin', name: 'admin', permissions: ['*'] },
      { id: 'r-librarian', name: 'librarian', permissions: ['catalog:write', 'circulation:manage', 'fine:collect'] },
      { id: 'r-member', name: 'member', permissions: ['book:read', 'borrow:self', 'reserve:self'] },
    ],
    permissions: [
      { id: 'p-1', code: 'book:read', description: '查詢館藏書目' },
      { id: 'p-2', code: 'borrow:self', description: '讀者自助借閱' },
      { id: 'p-3', code: 'reserve:self', description: '讀者預約候補' },
      { id: 'p-4', code: 'catalog:write', description: '編目與副本維護' },
      { id: 'p-5', code: 'circulation:manage', description: '櫃台流通借還管理' },
      { id: 'p-6', code: 'fine:collect', description: '逾期罰款收費銷帳' },
    ],
    profiles: [],
    user_roles: [],
    books: [],
    book_copies: [],
    authors: [{ id: 'a-1', name: 'Robert C. Martin' }],
    publishers: [{ id: 'p-1', name: 'Prentice Hall' }],
    categories: [{ id: 'c-1', code: '005.1', name: '軟體工程' }],
    members: [],
    borrow_records: [],
    reservations: [],
    fines: [],
    notifications: [],
    acquisitions: [],
    inventory_audits: [],
    branches: [
      { id: 'b-main', name: '台南總館' },
      { id: 'b-east', name: '東區分館' },
    ],
    audit_logs: [],
  };

  // 模擬 Supabase Client 查詢介面
  const mockSupabaseClient = {
    from(tableName) {
      if (!db[tableName]) {
        return {
          select: () => ({
            limit: async () => ({ data: null, error: { message: `Table ${tableName} not found` } }),
          }),
        };
      }
      return {
        select() {
          return {
            limit: async (n) => ({ data: db[tableName].slice(0, n), error: null }),
            eq: async (col, val) => ({ data: db[tableName].filter((row) => row[col] === val), error: null }),
          };
        },
        insert: async (payload) => {
          const rows = Array.isArray(payload) ? payload : [payload];
          db[tableName].push(...rows);
          return { data: rows, error: null };
        },
        update: (patch) => ({
          eq: async (col, val) => {
            const updated = [];
            db[tableName] = db[tableName].map((row) => {
              if (row[col] === val) {
                const next = { ...row, ...patch };
                updated.push(next);
                return next;
              }
              return row;
            });
            return { data: updated, error: null };
          },
        }),
      };
    },
  };

  // 模擬前端狀態 Store 與業務操作服務
  const frontendActions = {
    hasPermission(roleName, perm) {
      const role = db.roles.find((r) => r.name === roleName);
      if (!role) return false;
      return role.permissions.includes('*') || role.permissions.includes(perm);
    },
    async registerUser({ id, email, name, roleName }) {
      await mockSupabaseClient.from('profiles').insert({ id, email, name, email_verified: true });
      await mockSupabaseClient.from('user_roles').insert({ id: `ur-${id}`, user_id: id, role: roleName });
      if (roleName === 'member') {
        await mockSupabaseClient.from('members').insert({
          id: `m-${id}`,
          user_id: id,
          card_no: `LIB-${id.toUpperCase()}`,
          max_borrow_limit: 5,
          status: 'ACTIVE',
        });
      }
    },
    async createBookWithCopy({ bookId, isbn, title, barcode, branchId }) {
      await mockSupabaseClient.from('books').insert({
        id: bookId,
        isbn,
        title,
        author_id: 'a-1',
        publisher_id: 'p-1',
        category_id: 'c-1',
      });
      await mockSupabaseClient.from('book_copies').insert({
        id: `copy-${barcode}`,
        book_id: bookId,
        barcode,
        branch_id: branchId,
        status: 'AVAILABLE',
      });
    },
    async borrowBook({ memberId, barcode, borrowDays = 14 }) {
      const member = db.members.find((m) => m.id === memberId);
      assert.ok(member && member.status === 'ACTIVE', '讀者狀態必須為 ACTIVE');

      const activeBorrows = db.borrow_records.filter((r) => r.member_id === memberId && !r.returned_at);
      assert.ok(activeBorrows.length < member.max_borrow_limit, '超過最大借閱冊數限制');

      const copy = db.book_copies.find((c) => c.barcode === barcode);
      assert.ok(copy && copy.status === 'AVAILABLE', '館藏副本必須為 AVAILABLE 才可借閱');

      const dueDate = new Date(Date.now() + borrowDays * 86400000).toISOString();
      const record = {
        id: `br-${Date.now()}`,
        member_id: memberId,
        copy_id: copy.id,
        barcode,
        borrowed_at: new Date().toISOString(),
        due_date: dueDate,
        renew_count: 0,
        returned_at: null,
      };
      await mockSupabaseClient.from('borrow_records').insert(record);
      await mockSupabaseClient.from('book_copies').update({ status: 'BORROWED' }).eq('id', copy.id);
      return record;
    },
    async renewBorrow(recordId, extraDays = 7) {
      const record = db.borrow_records.find((r) => r.id === recordId);
      assert.ok(record && !record.returned_at, '借閱紀錄不存在或已歸還');
      assert.ok(record.renew_count < 1, '已達最大續借次數上限');

      const nextDue = new Date(new Date(record.due_date).getTime() + extraDays * 86400000).toISOString();
      await mockSupabaseClient
        .from('borrow_records')
        .update({ due_date: nextDue, renew_count: record.renew_count + 1 })
        .eq('id', recordId);
    },
    async returnBook({ recordId, overdueDays = 0 }) {
      const record = db.borrow_records.find((r) => r.id === recordId);
      assert.ok(record && !record.returned_at, '無效的歸還紀錄');

      await mockSupabaseClient
        .from('borrow_records')
        .update({ returned_at: new Date().toISOString() })
        .eq('id', recordId);

      // 檢查是否有預約候補佇列
      const pendingRes = db.reservations.find((res) => res.status === 'WAITING');
      const nextCopyStatus = pendingRes ? 'RESERVED' : 'AVAILABLE';
      await mockSupabaseClient.from('book_copies').update({ status: nextCopyStatus }).eq('id', record.copy_id);

      // 若逾期則產生罰款與通知
      if (overdueDays > 0) {
        const fineAmount = overdueDays * 5; // 每日 5 元
        const fine = {
          id: `fine-${recordId}`,
          member_id: record.member_id,
          amount: fineAmount,
          paid: false,
        };
        await mockSupabaseClient.from('fines').insert(fine);
        await mockSupabaseClient.from('notifications').insert({
          id: `notif-${recordId}`,
          member_id: record.member_id,
          message: `圖書逾期 ${overdueDays} 天，產生罰款 NT$${fineAmount}`,
        });
        return fine;
      }
      return null;
    },
  };

  return { db, mockSupabaseClient, frontendActions };
}

describe('LMS 分階段開發 Roadmap (Phase 1 ~ Phase 8) 前/後端全流程整合測試', () => {
  let sim;

  before(() => {
    sim = createIntegratedLmsSimulator();
  });

  it('Phase 1：驗證系統規劃、角色定義與 ERD 核心資料表健康度', async () => {
    const res = await verifyPhaseReadiness(1, sim.mockSupabaseClient);
    assert.equal(res.status, 'READY');
    assert.equal(sim.db.roles.length, 3);
    assert.equal(sim.db.permissions.length, 6);
  });

  it('Phase 2：驗證使用者註冊、Email 驗證狀態與 RBAC 權限控管', async () => {
    await sim.frontendActions.registerUser({
      id: 'u100',
      email: 'reader@tainan-lib.tw',
      name: '王小明',
      roleName: 'member',
    });
    const res = await verifyPhaseReadiness(2, sim.mockSupabaseClient);
    assert.equal(res.status, 'READY');
    assert.equal(sim.frontendActions.hasPermission('member', 'borrow:self'), true);
    assert.equal(sim.frontendActions.hasPermission('member', 'catalog:write'), false);
  });

  it('Phase 3：驗證書目 CRUD、館藏副本條碼建立與讀者建檔', async () => {
    await sim.frontendActions.createBookWithCopy({
      bookId: 'bk-clean-code',
      isbn: '9780132350884',
      title: 'Clean Code 無瑕的程式碼',
      barcode: 'BC-2026-0001',
      branchId: 'b-main',
    });
    const res = await verifyPhaseReadiness(3, sim.mockSupabaseClient);
    assert.equal(res.status, 'READY');
    assert.equal(sim.db.book_copies[0].status, 'AVAILABLE');
  });

  it('Phase 4：驗證借閱核心功能（借出 -> 副本狀態變更 -> 續借限制檢核）', async () => {
    const borrowRecord = await sim.frontendActions.borrowBook({
      memberId: 'm-u100',
      barcode: 'BC-2026-0001',
    });
    assert.equal(sim.db.book_copies[0].status, 'BORROWED');

    // 執行第一次續借應成功
    await sim.frontendActions.renewBorrow(borrowRecord.id, 7);
    assert.equal(sim.db.borrow_records[0].renew_count, 1);

    // 執行第二次續借應被規則阻擋
    await assert.rejects(
      async () => sim.frontendActions.renewBorrow(borrowRecord.id, 7),
      /已達最大續借次數上限/
    );
  });

  it('Phase 5：驗證進階業務（逾期歸還自動計罰、通知發送與繳費銷帳）', async () => {
    const activeRecord = sim.db.borrow_records[0];
    const fine = await sim.frontendActions.returnBook({
      recordId: activeRecord.id,
      overdueDays: 3,
    });

    assert.equal(fine.amount, 15);
    assert.equal(sim.db.book_copies[0].status, 'AVAILABLE');
    assert.equal(sim.db.notifications.length, 1);

    // 模擬前端點擊繳費銷帳
    await sim.mockSupabaseClient.from('fines').update({ paid: true }).eq('id', fine.id);
    assert.equal(sim.db.fines[0].paid, true);
  });

  it('Phase 6：驗證館務管理（採購單、館藏盤點紀錄與多分館調撥）', async () => {
    await sim.mockSupabaseClient.from('acquisitions').insert({
      id: 'acq-01',
      title: 'Refactoring 重構',
      quantity: 3,
      status: 'RECEIVED',
    });
    await sim.mockSupabaseClient.from('inventory_audits').insert({
      id: 'audit-2026Q4',
      branch_id: 'b-main',
      scanned_count: 1,
      missing_count: 0,
    });
    // 調撥副本至東區分館
    await sim.mockSupabaseClient
      .from('book_copies')
      .update({ branch_id: 'b-east' })
      .eq('barcode', 'BC-2026-0001');

    const res = await verifyPhaseReadiness(6, sim.mockSupabaseClient);
    assert.equal(res.status, 'READY');
    assert.equal(sim.db.book_copies[0].branch_id, 'b-east');
  });

  it('Phase 7 & Phase 8：驗證報表統計匯總與全階段 Roadmap 100% 獨立通過', async () => {
    await sim.mockSupabaseClient.from('audit_logs').insert({
      id: 'log-e2e-complete',
      action: 'EXPORT_ANALYTICS_REPORT',
      detail: '匯出借閱統計與館藏分析報表',
    });

    // 逐一驗證所有 8 個 Phase 皆可獨立通過檢查
    for (const phase of LMS_ROADMAP_PHASES) {
      const check = await verifyPhaseReadiness(phase.phaseNumber, sim.mockSupabaseClient);
      assert.equal(check.status, 'READY', `${phase.title} 驗證失敗`);
    }

    const summary = calculateRoadmapProgress([1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(summary.percentage, 100);
    assert.equal(summary.nextPhase, null);
  });
});
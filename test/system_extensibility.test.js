/**
 * test/system_extensibility.test.js
 * 第九個重要思維：系統擴充性 (System Extensibility) 前後端實際操作整合測試
 *
 * 執行指令：
 *   npm run test:extensibility
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

// 確保在載入任何依賴 supabase.js 的模組前，已有可用的測試環境變數
process.env.VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
process.env.VITE_SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'test-anon-key-placeholder';

const { createExtensibilityService } = await import('../src/lib/extensibilityService.js');
const {
  withCoreAuditFields,
  buildSafeDeletePatch,
  filterActiveRecords,
  IMMUTABLE_HISTORY_TABLES,
} = await import('../src/lib/auditHelper.js');
const { useLibraryStore } = await import('../src/store/useLibraryStore.js');

/**
 * 記憶體版 Supabase QueryBuilder 與資料倉儲（模擬真實資料庫 CRUD、關聯 Join 與防刪除 Trigger）
 */
class InMemorySupabaseMock {
  constructor() {
    this.tables = {
      branches: [],
      books: [],
      book_copies: [],
      members: [],
      borrow_records: [],
      payments: [],
      audit_logs: [],
      interlibrary_transfers: [],
      rfid_scan_logs: [],
      ebooks: [],
      ebook_loans: [],
      notification_logs: [],
    };
  }

  from(tableName) {
    if (!this.tables[tableName]) {
      this.tables[tableName] = [];
    }
    return new MockQueryBuilder(this, tableName);
  }
}

class MockQueryBuilder {
  constructor(db, tableName) {
    this.db = db;
    this.tableName = tableName;
    this.filters = [];
    this.op = 'SELECT';
    this.payload = null;
    this.selectExpr = '*';
  }

  select(expr = '*') {
    this.selectExpr = expr;
    return this;
  }

  insert(rows) {
    this.op = 'INSERT';
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  update(patch) {
    this.op = 'UPDATE';
    this.payload = patch;
    return this;
  }

  delete() {
    this.op = 'DELETE';
    return this;
  }

  eq(col, val) {
    this.filters.push((row) => row[col] === val);
    return this;
  }

  is(col, val) {
    this.filters.push((row) => (val === null ? row[col] == null : row[col] === val));
    return this;
  }

  _hydrate(row) {
    const cloned = { ...row };
    if (this.tableName === 'book_copies') {
      cloned.book = this.db.tables.books.find((b) => b.id === row.book_id) || null;
      cloned.branch = this.db.tables.branches.find((br) => br.id === row.current_branch_id) || null;
    }
    if (this.tableName === 'borrow_records') {
      const copy = this.db.tables.book_copies.find((c) => c.id === row.copy_id);
      cloned.copy = copy ? { ...copy, book: this.db.tables.books.find((b) => b.id === copy.book_id) } : null;
    }
    return cloned;
  }

  async _exec() {
    const table = this.db.tables[this.tableName];

    if (this.op === 'DELETE') {
      if (IMMUTABLE_HISTORY_TABLES.has(this.tableName)) {
        return {
          data: null,
          error: { message: `資安與稽核規範：資料表 [${this.tableName}] 屬於不可變歷史紀錄，禁止執行 DELETE！` },
        };
      }
      const remaining = table.filter((r) => !this.filters.every((fn) => fn(r)));
      this.db.tables[this.tableName] = remaining;
      return { data: [], error: null };
    }

    if (this.op === 'INSERT') {
      const inserted = this.payload.map((item) => ({ ...item }));
      table.push(...inserted);
      return { data: inserted.map((r) => this._hydrate(r)), error: null };
    }

    if (this.op === 'UPDATE') {
      const matched = table.filter((r) => this.filters.every((fn) => fn(r)));
      for (const row of matched) {
        Object.assign(row, this.payload);
      }
      return { data: matched.map((r) => this._hydrate(r)), error: null };
    }

    const rows = table.filter((r) => this.filters.every((fn) => fn(r))).map((r) => this._hydrate(r));
    return { data: rows, error: null };
  }

  async single() {
    const res = await this._exec();
    if (res.error) return res;
    if (!res.data || res.data.length === 0) {
      return { data: null, error: { message: '找不到符合條件的資料列' } };
    }
    return { data: res.data[0], error: null };
  }

  then(resolve, reject) {
    return this._exec().then(resolve, reject);
  }
}

describe('第九個重要思維：系統擴充性 (System Extensibility) 全端整合測試', () => {
  const mockDb = new InMemorySupabaseMock();
  const extService = createExtensibilityService(mockDb);

  const adminActorId = 'staff-admin-001';
  let mainBranch;
  let eastBranch;
  let memberAlice;
  let memberBob;
  let bookCleanArch;
  let bookDomainDriven;
  let bookCooking;
  let copyMain1;
  let copyMain2;
  let copyEast1;

  const mockCirculation = {
    async borrowBook({ barcode, memberId, currentBranchId }) {
      const copy = mockDb.tables.book_copies.find((c) => c.barcode === barcode && !c.deleted_at);
      if (!copy) throw new Error(`找不到條碼: ${barcode}`);
      if (!['AVAILABLE', 'RESERVED'].includes(copy.status)) {
        throw new Error(`館藏狀態為 ${copy.status}，無法借出`);
      }

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 14);

      const record = withCoreAuditFields(
        {
          copy_id: copy.id,
          member_id: memberId,
          borrow_branch_id: currentBranchId,
          is_interlibrary: copy.home_branch_id !== currentBranchId,
          borrowed_at: new Date().toISOString(),
          due_date: dueDate.toISOString(),
          status: 'ACTIVE',
        },
        { actorId: memberId, supportsSoftDelete: false }
      );
      mockDb.tables.borrow_records.push(record);
      copy.status = 'BORROWED';
      return { record, dueDate };
    },
  };

  before(async () => {
    mainBranch = await extService.createBranch(
      { code: 'MAIN', name: '台南總館', address: '台南市東區' },
      adminActorId
    );
    eastBranch = await extService.createBranch(
      { code: 'EAST', name: '安平分館', address: '台南市安平區' },
      adminActorId
    );

    useLibraryStore.getState().setBranches([mainBranch, eastBranch]);

    memberAlice = withCoreAuditFields(
      {
        member_code: 'M-2026-001',
        full_name: '林雅婷',
        email: 'alice@example.com',
        line_user_id: 'U_ALICE_LINE_888',
        notify_email: true,
        notify_line: true,
        preferred_categories: ['軟體工程'],
        status: 'ACTIVE',
      },
      { actorId: adminActorId, supportsSoftDelete: true }
    );
    memberBob = withCoreAuditFields(
      {
        member_code: 'M-2026-002',
        full_name: '張志明',
        email: 'bob@example.com',
        notify_email: true,
        notify_line: false,
        preferred_categories: ['軟體工程'],
        status: 'ACTIVE',
      },
      { actorId: adminActorId, supportsSoftDelete: true }
    );
    mockDb.tables.members.push(memberAlice, memberBob);

    bookCleanArch = withCoreAuditFields(
      { isbn: '9780134494166', title: 'Clean Architecture 無瑕的程式碼架構', category: '軟體工程' },
      { actorId: adminActorId }
    );
    bookDomainDriven = withCoreAuditFields(
      { isbn: '9780321125217', title: 'Domain-Driven Design 領域驅動設計', category: '軟體工程' },
      { actorId: adminActorId }
    );
    bookCooking = withCoreAuditFields(
      { isbn: '9789861112223', title: '低溫慢煮健康料理指南', category: '生活飲食' },
      { actorId: adminActorId }
    );
    mockDb.tables.books.push(bookCleanArch, bookDomainDriven, bookCooking);

    copyMain1 = withCoreAuditFields(
      {
        book_id: bookCleanArch.id,
        barcode: 'BC-MAIN-001',
        rfid_epc: 'EPC-9780134494166-01',
        home_branch_id: mainBranch.id,
        current_branch_id: mainBranch.id,
        status: 'AVAILABLE',
      },
      { actorId: adminActorId }
    );
    copyMain2 = withCoreAuditFields(
      {
        book_id: bookDomainDriven.id,
        barcode: 'BC-MAIN-002',
        rfid_epc: 'EPC-9780321125217-01',
        home_branch_id: mainBranch.id,
        current_branch_id: mainBranch.id,
        status: 'AVAILABLE',
      },
      { actorId: adminActorId }
    );
    copyEast1 = withCoreAuditFields(
      {
        book_id: bookCooking.id,
        barcode: 'BC-EAST-001',
        rfid_epc: 'EPC-9789861112223-01',
        home_branch_id: eastBranch.id,
        current_branch_id: eastBranch.id,
        status: 'AVAILABLE',
      },
      { actorId: adminActorId }
    );
    mockDb.tables.book_copies.push(copyMain1, copyMain2, copyEast1);
  });

  it('[核心規範] 驗證核心資料預留欄位與歷史紀錄不可任意刪除保護', async () => {
    for (const key of ['id', 'created_at', 'updated_at', 'created_by', 'updated_by', 'deleted_at']) {
      assert.ok(key in mainBranch, `分館主檔缺少核心預留欄位: ${key}`);
      assert.ok(key in copyMain1, `館藏副本缺少核心預留欄位: ${key}`);
    }
    assert.equal(mainBranch.created_by, adminActorId);
    assert.equal(mainBranch.deleted_at, null);

    const payment = withCoreAuditFields(
      { receipt_no: 'PAY-2026-0001', amount: 50, method: 'CASH' },
      { actorId: adminActorId, supportsSoftDelete: false }
    );
    const audit = withCoreAuditFields(
      { actor_id: adminActorId, action: 'INIT_SYSTEM', target_table: 'branches' },
      { actorId: adminActorId, supportsSoftDelete: false }
    );
    mockDb.tables.payments.push(payment);
    mockDb.tables.audit_logs.push(audit);

    assert.equal('deleted_at' in payment, false, '歷史繳費表不應包含 deleted_at 軟刪除欄位');
    assert.throws(() => {
      buildSafeDeletePatch('payments', payment, adminActorId);
    }, /嚴禁刪除或軟刪除/);

    const dbDelRes = await mockDb.from('audit_logs').delete().eq('id', audit.id);
    assert.match(dbDelRes.error.message, /禁止執行 DELETE/);

    const tempBook = withCoreAuditFields({ isbn: '9780000000000', title: '待下架測試書' }, { actorId: adminActorId });
    const softDeleted = buildSafeDeletePatch('books', tempBook, adminActorId);
    assert.ok(softDeleted.deleted_at, '軟刪除應填入 deleted_at 時間戳');
    assert.equal(filterActiveRecords([bookCleanArch, softDeleted]).length, 1);
  });

  it('[擴充 1 & 2] 多分館獨立館藏隔離與跨館借閱調撥流程', async () => {
    const mainInventory = await extService.getBranchInventory(mainBranch.id);
    const eastInventory = await extService.getBranchInventory(eastBranch.id);

    assert.equal(mainInventory.length, 2, '總館應有 2 冊獨立館藏');
    assert.equal(eastInventory.length, 1, '安平分館應有 1 冊獨立館藏');

    const transfer = await extService.requestInterlibraryTransfer(
      {
        copyId: copyMain2.id,
        fromBranchId: mainBranch.id,
        toBranchId: eastBranch.id,
        memberId: memberBob.id,
      },
      adminActorId
    );
    assert.equal(transfer.status, 'IN_TRANSIT');
    assert.equal(copyMain2.status, 'IN_TRANSIT');

    const received = await extService.completeInterlibraryTransfer(transfer.id, adminActorId);
    assert.equal(received.status, 'RECEIVED');
    assert.equal(copyMain2.current_branch_id, eastBranch.id, '點收後當前館藏地應更新為安平分館');
    assert.equal(copyMain2.status, 'RESERVED', '有指定跨館借閱讀者時應自動轉為保留待取');
  });

  it('[擴充 3] RFID 高頻批次盤點（比對在架、遺失異常與未登錄標籤）', async () => {
    const report = await extService.batchRfidInventory(
      {
        branchId: mainBranch.id,
        scannedEpcs: ['EPC-9780134494166-01', 'EPC-UNKNOWN-999'],
      },
      adminActorId
    );

    assert.equal(report.matchedCount, 1, '應成功比對 1 冊總館在架館藏');
    assert.equal(report.missingCopies.length, 0, '不應誤報已調撥他館的書籍為遺失');
    assert.deepEqual(report.unknownTags, ['EPC-UNKNOWN-999'], '應偵測出未建檔異常 RFID 標籤');
    assert.equal(mockDb.tables.rfid_scan_logs.length, 2, '應寫入 2 筆不可刪除的 RFID 盤點日誌');
  });

  it('[擴充 4] QR Code 數位讀者證與館藏條碼產生及雙向查詢', async () => {
    const memberQr = extService.generateEntityQrPayload('MEMBER', memberAlice.member_code);
    assert.ok(memberQr.token.startsWith('LIBQR:'));

    const lookupMember = await extService.lookupByQrToken(memberQr.token);
    assert.equal(lookupMember.entityType, 'MEMBER');
    assert.equal(lookupMember.data.full_name, '林雅婷');

    const copyQr = extService.generateEntityQrPayload('COPY', copyMain1.barcode);
    const lookupCopy = await extService.lookupByQrToken(copyQr.token);
    assert.equal(lookupCopy.entityType, 'COPY');
    assert.equal(lookupCopy.data.book.title, 'Clean Architecture 無瑕的程式碼架構');
  });

  it('[擴充 5] 電子書數位資源管理與同時在線席次 DRM 控管', async () => {
    const ebook = await extService.registerEbook(
      {
        isbn: '9789865556667',
        title: 'Supabase 全端雲端架構實戰 (電子書)',
        author: '系統架構團隊',
        fileFormat: 'EPUB',
        storageUrl: 'https://cdn.library.local/ebooks/supabase-arch.epub',
        totalLicenses: 1,
      },
      adminActorId
    );

    const loan1 = await extService.borrowEbook({ ebookId: ebook.id, memberId: memberAlice.id }, memberAlice.id);
    assert.ok(loan1.access_token.startsWith('DRM-'));

    await assert.rejects(
      () => extService.borrowEbook({ ebookId: ebook.id, memberId: memberBob.id }, memberBob.id),
      /同時在線授權數已滿/
    );
  });

  it('[擴充 6] ISBN API 自動取得書籍資訊', async () => {
    const mockFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        'ISBN:9780134685991': {
          title: 'Effective Java',
          subtitle: '3rd Edition',
          authors: [{ name: 'Joshua Bloch' }],
          publishers: [{ name: 'Addison-Wesley' }],
          publish_date: '2018',
          cover: { medium: 'https://covers.openlibrary.org/b/id/8259443-M.jpg' },
        },
      }),
    });

    const meta = await extService.fetchBookMetadataByIsbn('978-0-13-468599-1', mockFetch);
    assert.equal(meta.isbn, '9780134685991');
    assert.equal(meta.title, 'Effective Java');
    assert.equal(meta.author, 'Joshua Bloch');
    assert.equal(meta.publish_year, 2018);
  });

  it('[擴充 7, 8 & 9] 自助借還機 (Kiosk) 整合 QR 讀者證、RFID 感應借書與 Email / LINE 雙管道通知', async () => {
    const sentEmails = [];
    const sentLineMsgs = [];

    const senderAdapters = {
      sendEmail: async (msg) => sentEmails.push(msg),
      sendLinePush: async (msg) => sentLineMsgs.push(msg),
    };

    const aliceQr = extService.generateEntityQrPayload('MEMBER', memberAlice.member_code);

    const kioskRes = await extService.selfServiceCheckout(
      {
        memberQrToken: aliceQr.token,
        itemIdentifiers: ['EPC-9780134494166-01'],
        branchId: mainBranch.id,
      },
      mockCirculation,
      senderAdapters
    );

    assert.equal(kioskRes.count, 1);
    assert.equal(copyMain1.status, 'BORROWED');
    assert.equal(sentEmails.length, 1, '應發送 1 封 Email 自助借書明細');
    assert.equal(sentLineMsgs.length, 1, '應發送 1 則 LINE 即時提醒');
    assert.equal(mockDb.tables.notification_logs.length, 2, '應保留 2 筆不可刪除的通知發送日誌');
  });

  it('[擴充 10] AI 智慧閱讀推薦引擎與前端 Zustand Store 狀態同步', async () => {
    const extraCopy = withCoreAuditFields(
      {
        book_id: bookCleanArch.id,
        barcode: 'BC-EAST-002',
        home_branch_id: eastBranch.id,
        current_branch_id: eastBranch.id,
        status: 'AVAILABLE',
      },
      { actorId: adminActorId }
    );
    mockDb.tables.book_copies.push(extraCopy);

    await mockCirculation.borrowBook({
      barcode: 'BC-EAST-002',
      memberId: memberBob.id,
      currentBranchId: eastBranch.id,
    });
    await mockCirculation.borrowBook({
      barcode: 'BC-MAIN-002',
      memberId: memberBob.id,
      currentBranchId: eastBranch.id,
    });

    const recs = await useLibraryStore.getState().loadAiRecommendations(memberAlice.id, extService);
    const storeRecs = useLibraryStore.getState().aiRecommendations;

    assert.ok(recs.length >= 1);
    assert.equal(storeRecs[0].id, bookDomainDriven.id, 'AI 應結合協同過濾與分類偏好優先推薦《領域驅動設計》');
    assert.match(storeRecs[0].recommendation_reason, /相似閱讀興趣讀者也借閱過/);
  });
});
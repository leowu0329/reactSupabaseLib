/**
 * test/system_architecture.test.js
 * 第四個重要思維：系統架構（System Architecture）全端實際操作整合測試
 * 驗證範圍：
 *   1. 前端 Zustand 全域狀態管理層 (useLibraryStore) 與 RBAC 權限邏輯
 *   2. 外部服務模組 (QR Code 產生器)
 *   3. 前後端資料流串接 (Store -> libraryService -> Supabase PostgreSQL -> Store 快取同步)
 *   4. 完整流通交易 (建立正規化書目副本 -> 借出 -> Store 庫存即時遞減 -> 歸還 -> 庫存恢復)
 *
 * 執行方式：
 *   npm install zustand
 *   npm run test:arch
 */
import assert from 'node:assert/strict';
import { supabase } from '../src/lib/supabase.js';
import { libraryService } from '../src/lib/libraryService.js';
import { externalService } from '../src/lib/externalService.js';
import { useLibraryStore } from '../src/store/useLibraryStore.js';
import { ROLES } from '../src/config/permissions.js';

async function createTestUser() {
  const unique = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const email = `sys_arch_${unique}@example.com`;
  const password = 'TestPassword123!';

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data?.user?.id) {
    throw new Error(`建立測試帳號失敗: ${error?.message || '未取得 user.id'}`);
  }

  const member = await libraryService.ensureMemberProfile(
    data.user.id,
    email,
    '系統架構測試員'
  );

  return { user: data.user, email, member };
}

async function runSystemArchitectureTests() {
  console.log('====================================================================');
  console.log('🏗️  開始執行「系統架構 (System Architecture)」全端實際操作整合測試');
  console.log('====================================================================\n');

  let testAccount = null;
  let createdBookId = null;

  try {
    // ------------------------------------------------------------------------
    // 階段 1：驗證前端狀態管理層 (Zustand Store) 與 RBAC 權限切換
    // ------------------------------------------------------------------------
    console.log('▶ [階段 1] 驗證前端狀態管理層 (Zustand) 與角色權限狀態...');
    const initialState = useLibraryStore.getState();
    assert.equal(initialState.role, ROLES.GUEST, '初始未登入角色應為 GUEST');
    assert.equal(initialState.can('book.create'), false, 'GUEST 不可新增書籍');

    testAccount = await createTestUser();
    await useLibraryStore.getState().syncAuthSession(testAccount.user);

    const loggedInState = useLibraryStore.getState();
    assert.equal(loggedInState.user.id, testAccount.user.id, 'Store 應正確同步登入 User ID');
    assert.equal(loggedInState.role, ROLES.MEMBER, '預設註冊帳號角色應同步為 MEMBER');
    assert.equal(loggedInState.can('borrow.create'), true, 'MEMBER 應具備借閱權限');
    assert.equal(loggedInState.can('system.settings'), false, 'MEMBER 不可修改系統設定');
    console.log(`✅ [階段 1 通過] Zustand Store 狀態與角色權限同步正確！(會員證號: ${testAccount.member.member_code})\n`);

    // ------------------------------------------------------------------------
    // 階段 2：驗證外部服務模組 (QR Code 產生)
    // ------------------------------------------------------------------------
    console.log('▶ [階段 2] 驗證外部服務介面 (QR Code 憑證產生)...');
    const qrUrl = externalService.generateQrCodeUrl(testAccount.member.member_code);
    assert.ok(qrUrl.startsWith('https://api.qrserver.com/'), '應產生有效 QR Code 服務網址');
    assert.ok(qrUrl.includes(testAccount.member.member_code), 'QR Code 網址應夾帶會員證號');
    console.log(`✅ [階段 2 通過] 外部 QR Code 服務整合正常！(${qrUrl})\n`);

    // ------------------------------------------------------------------------
    // 階段 3：前後端資料流整合 (後端建檔 -> 前端 Store 拉取並驗證快取)
    // ------------------------------------------------------------------------
    console.log('▶ [階段 3] 驗證後端正規化寫入與前端 Store 書目狀態同步...');
    const testIsbn = `978986${Math.floor(1000000 + Math.random() * 9000000)}`;
    const testBarcode = `${testIsbn}-C001`;

    const created = await libraryService.createNormalizedBookWithCopies(
      {
        isbn: testIsbn,
        title: '全端系統架構設計與實戰',
        author: '林架構',
        publisher: '雲端科技出版',
        categoryCode: '312',
        category: '系統架構',
      },
      [{ barcode: testBarcode }]
    );
    createdBookId = created.book.id;

    // 透過前端 Store Action 拉取最新資料庫狀態
    await useLibraryStore.getState().fetchBooks();
    const bookInStore = useLibraryStore.getState().books.find((b) => b.id === createdBookId);

    assert.ok(bookInStore, '前端 Store 應成功同步後端新建的書目');
    assert.equal(bookInStore.available_copies, 1, 'Store 顯示初始可借閱副本應為 1 本');
    console.log(`✅ [階段 3 通過] 前端 Store 與後端 PostgreSQL 資料完全一致！\n`);

    // ------------------------------------------------------------------------
    // 階段 4：端到端流通借還操作與即時通知狀態驗證
    // ------------------------------------------------------------------------
    console.log('▶ [階段 4] 執行端到端借出 / 歸還操作與通知中心狀態更新...');
    // 1. 執行借出
    const borrowRes = await libraryService.borrowCopy(testAccount.user.id, testBarcode, 14);
    assert.ok(borrowRes.loan_item_id, '後端應回傳有效借閱明細 ID');

    // 同步前端 Store 並推入通知
    await useLibraryStore.getState().fetchBooks();
    useLibraryStore.getState().pushNotification({
      title: '借閱完成',
      message: `條碼 ${testBarcode} 已成功借出`,
    });

    const afterBorrowBook = useLibraryStore.getState().books.find((b) => b.id === createdBookId);
    assert.equal(afterBorrowBook.available_copies, 0, '借出後前端 Store 可借閱數量應即時更新為 0');
    assert.equal(useLibraryStore.getState().notifications.length, 1, '通知中心應收到 1 則即時通知');

    // 2. 執行歸還
    const returnRes = await libraryService.returnCopy(testBarcode);
    assert.equal(returnRes.overdue_days, 0, '當日歸還逾期天數應為 0');

    // 再次同步前端 Store 確認庫存恢復
    await useLibraryStore.getState().fetchBooks();
    const afterReturnBook = useLibraryStore.getState().books.find((b) => b.id === createdBookId);
    assert.equal(afterReturnBook.available_copies, 1, '歸還後前端 Store 可借閱數量應恢復為 1');
    console.log('✅ [階段 4 通過] 前後端借還流程、庫存連動與通知狀態皆運作無誤！\n');

    console.log('🎉 恭喜！全端系統架構（Store + RBAC + 外部服務 + Supabase DB）測試全數通過！');
  } finally {
    if (createdBookId) {
      await supabase
        .from('book_copies')
        .delete()
        .eq('book_id', createdBookId)
        .eq('status', 'available');
    }
    await supabase.auth.signOut();
    console.log('🧹 測試環境與暫存資料已清理完畢。');
  }
}

runSystemArchitectureTests().catch((err) => {
  console.error('\n❌ 系統架構全端整合測試失敗：', err);
  process.exit(1);
});
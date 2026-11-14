import assert from 'node:assert/strict';
import { libraryService } from '../src/lib/libraryService.js';
import { supabase } from '../src/lib/supabase.js';

/**
 * 輔助函數：透過 Supabase Auth 建立真實測試帳號以符合外鍵約束 (user_id_fkey)
 */
async function createTestUser(label) {
  const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const email = `test_${label}_${uniqueSuffix}@example.com`;
  const password = 'TestPassword123!';

  const { data, error } = await supabase.auth.signUp({
    email,
    password
  });

  if (error || !data?.user?.id) {
    throw new Error(`建立測試讀者 (${label}) 失敗: ${error?.message || '未取得 user.id'}`);
  }
  return data.user.id;
}

async function runFullWorkflowTest() {
  console.log('🚀 開始執行圖書館三大核心業務流程整合測試...\n');

  let readerA = null;
  let readerB = null;
  let readerC = null;
  let createdBookId = null;

  try {
    console.log('👤 [前置作業] 建立 3 位真實測試讀者帳號...');
    [readerA, readerB, readerC] = await Promise.all([
      createTestUser('readerA'),
      createTestUser('readerB'),
      createTestUser('readerC')
    ]);
    console.log(`✅ 測試讀者建立完成 (A: ${readerA.slice(0, 8)}..., B: ${readerB.slice(0, 8)}..., C: ${readerC.slice(0, 8)}...)\n`);

    const testIsbn = `978986${Math.floor(1000000 + Math.random() * 9000000)}`;

    // =========================================================================
    // 測試階段 1：圖書管理流程（1 筆書目 + 2 筆獨立副本）
    // =========================================================================
    console.log('📘 [階段 1] 測試書目與館藏副本分離建立...');
    const { book, copies } = await libraryService.createBookWithCopies(
      {
        isbn: testIsbn,
        title: 'JavaScript 完整學習指南',
        author: 'David Flanagan',
        publisher: '歐萊禮',
        category: '程式設計',
        tags: ['JS', 'Web']
      },
      [
        { barcode: `${testIsbn}-001`, location: '3F-資訊區-A1' },
        { barcode: `${testIsbn}-002`, location: '3F-資訊區-A2' }
      ]
    );

    createdBookId = book.id;
    assert.equal(copies.length, 2, '應該建立 2 筆獨立館藏副本');
    assert.equal(copies[0].status, 'available', '初始狀態應為 available');
    console.log(`✅ 成功建立書目 (${book.title}) 與 2 筆副本條碼\n`);

    // =========================================================================
    // 測試階段 2：借閱流程與規則阻擋
    // =========================================================================
    console.log('📖 [階段 2] 測試讀者借閱與重複借出阻擋...');
    await libraryService.borrowCopy(readerA, `${testIsbn}-001`, 14);
    await libraryService.borrowCopy(readerB, `${testIsbn}-002`, 14);

    await assert.rejects(
      () => libraryService.borrowCopy(readerC, `${testIsbn}-001`),
      /無法借閱/,
      '已借出的副本不應允許再次借出'
    );
    console.log('✅ 兩本副本皆成功借出，且系統正確阻擋重複借閱\n');

    // =========================================================================
    // 測試階段 3：預約與候補排隊、防重複預約
    // =========================================================================
    console.log('⏳ [階段 3] 測試預約候補順位與重複預約限制...');
    const resC = await libraryService.reserveBook(readerC, createdBookId);
    assert.equal(resC.queue_position, 1, '讀者 C 應為第 1 順位');

    const resA = await libraryService.reserveBook(readerA, createdBookId);
    assert.equal(resA.queue_position, 2, '讀者 A 應為第 2 順位');

    await assert.rejects(
      () => libraryService.reserveBook(readerC, createdBookId),
      /duplicate key|unique/i,
      '同一讀者不應允許重複預約同一本書'
    );
    console.log('✅ 預約排隊順位正確 (C=1, A=2)，且成功阻擋同一人重複預約\n');

    // =========================================================================
    // 測試階段 4：歸還流程（模擬逾期計費 + 自動保留給第一順位讀者 C）
    // =========================================================================
    console.log('🔄 [階段 4] 測試逾期歸還計費與預約自動通知保留...');
    // 模擬第 20 天歸還（取書期限將設定為第 20 + 3 = 第 23 天）
    const futureReturnDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000 - 60 * 1000).toISOString();
    const returnResult = await libraryService.returnCopy(`${testIsbn}-001`, futureReturnDate);

    assert.equal(returnResult.overdue_days, 6, '逾期天數應為 6 天');
    assert.equal(Number(returnResult.fine_amount), 30, '逾期罰金應為 30 元');
    assert.equal(returnResult.copy_status, 'reserved', '歸還後因有預約，副本狀態應轉為 reserved');
    assert.equal(returnResult.next_reserved_user_id, readerC, '應優先保留給第一順位讀者 C');

    await assert.rejects(
      () => libraryService.borrowCopy(readerA, `${testIsbn}-001`),
      /保留給其他預約讀者/,
      '非第一順位讀者不應借走保留副本'
    );
    console.log('✅ 逾期罰金計算正確 ($30)，副本已自動鎖定保留給讀者 C\n');

    // =========================================================================
    // 測試階段 5：預約逾期自動取消並遞補給第二順位讀者 A
    // =========================================================================
    console.log('⏰ [階段 5] 測試預約取書逾期自動遞補機制...');
    // 接續階段 4 時間軸：推進至第 24 天（已超過第 23 天的取書期限）
    const afterDeadline = new Date(Date.now() + 24 * 24 * 60 * 60 * 1000).toISOString();
    const expiredCount = await libraryService.checkExpiredReservations(afterDeadline);
    assert.equal(expiredCount, 1, '應處理 1 筆逾期未取預約');

    const borrowByA = await libraryService.borrowCopy(readerA, `${testIsbn}-001`);
    assert.ok(borrowByA.borrow_id, '遞補後的讀者 A 應能順利完成借閱');
    console.log('✅ 讀者 C 逾期未取已自動取消，並成功遞補給讀者 A 完成借閱\n');

    // =========================================================================
    // 測試階段 6：館藏損壞連動取消超額預約
    // =========================================================================
    console.log('⚠️ [階段 6] 測試館藏損壞連動清理超額預約...');
    await libraryService.returnCopy(`${testIsbn}-002`);
    await libraryService.borrowCopy(readerB, `${testIsbn}-002`);
    await libraryService.reserveBook(readerC, createdBookId);

    await libraryService.returnCopy(`${testIsbn}-001`);
    await libraryService.returnCopy(`${testIsbn}-002`);
    await libraryService.reportCopyDamaged(`${testIsbn}-001`);
    const damageRes = await libraryService.reportCopyDamaged(`${testIsbn}-002`);

    assert.equal(damageRes.healthy_copies_remaining, 0, '健康副本應為 0');
    assert.equal(damageRes.cancelled_reservation_ids.length, 1, '無健康副本時應自動取消 1 筆無法支應的預約');
    console.log('✅ 館藏全數損壞時，已自動取消超額預約紀錄\n');

    console.log('🎉 所有前後端業務邏輯與邊界條件測試全數通過！');
  } finally {
    // 清理測試書籍與借閱紀錄
    const validUsers = [readerA, readerB, readerC].filter(Boolean);
    if (validUsers.length > 0) {
      await supabase.from('borrow_records').delete().in('user_id', validUsers);
    }
    if (createdBookId) {
      await supabase.from('books').delete().eq('id', createdBookId);
    }
    console.log('🧹 測試資料已清理完畢。');
  }
}

runFullWorkflowTest().catch((err) => {
  console.error('❌ 測試執行失敗:', err);
  process.exit(1);
});
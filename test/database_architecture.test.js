/**
 * test/database_architecture.test.js
 * 圖書館系統資料庫架構（四大核心原則）前後端實際操作整合測試
 * 執行方式：npm run test:db
 */
import assert from 'node:assert/strict';
import { supabase } from '../src/lib/supabase.js';
import { libraryService } from '../src/lib/libraryService.js';

async function createTestReader(tag) {
  const unique = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const email = `db_arch_${tag}_${unique}@example.com`;
  const password = 'TestPassword123!';

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data?.user?.id) {
    throw new Error(`建立測試帳號 (${tag}) 失敗: ${error?.message || '無 user.id'}`);
  }

  const member = await libraryService.ensureMemberProfile(
    data.user.id,
    email,
    `測試讀者_${tag}`
  );

  return { userId: data.user.id, email, member };
}

async function runDatabaseArchitectureTests() {
  console.log('====================================================================');
  console.log('🧪 開始執行「第三個重要思維：資料庫架構」前後端實際操作整合測試');
  console.log('====================================================================\n');

  let reader1 = null;
  let reader2 = null;
  let createdBookId = null;

  try {
    // ------------------------------------------------------------------------
    // 前置作業：建立兩位真實讀者帳號與 members 主檔
    // ------------------------------------------------------------------------
    console.log('▶ [前置作業] 建立兩位測試讀者與正規化 members 主檔...');
    [reader1, reader2] = await Promise.all([
      createTestReader('librarian_or_reader_1'),
      createTestReader('reader_2'),
    ]);
    console.log(`✅ 讀者建立成功：
   - 讀者 1 Member Code: ${reader1.member.member_code}
   - 讀者 2 Member Code: ${reader2.member.member_code}\n`);

    // ------------------------------------------------------------------------
    // 測試原則 A：書籍與副本分離 + 正規化主檔 (publishers, categories, authors, book_authors)
    // ------------------------------------------------------------------------
    console.log('▶ [測試原則 A] 驗證書籍與副本分離及正規化關聯表寫入與前端查詢...');
    const testIsbn = `978986${Math.floor(1000000 + Math.random() * 9000000)}`;
    const barcode1 = `${testIsbn}-C001`;
    const barcode2 = `${testIsbn}-C002`;

    const created = await libraryService.createNormalizedBookWithCopies(
      {
        isbn: testIsbn,
        title: 'PostgreSQL 資料庫架構設計實戰',
        author: '陳架構',
        publisher: '全端技術出版社',
        categoryCode: '312',
        category: '資料庫系統',
        unitPrice: 580,
      },
      [{ barcode: barcode1 }, { barcode: barcode2 }]
    );

    createdBookId = created.book.id;
    assert.ok(created.book.publisher_id, 'books 應透過 publisher_id 關聯 publishers');
    assert.ok(created.book.category_id, 'books 應透過 category_id 關聯 categories');
    assert.equal(created.copies.length, 2, 'book_copies 應建立 2 筆獨立實體副本');

    const frontendBooks = await libraryService.getBooksWithCopies();
    const targetFrontendBook = frontendBooks.find((b) => b.id === createdBookId);
    assert.ok(targetFrontendBook, '前端書目列表應能正確查詢到新建書目');
    assert.equal(targetFrontendBook.author_names, '陳架構', '前端應正確串接 book_authors -> authors');
    assert.equal(targetFrontendBook.publisher_name, '全端技術出版社', '前端應正確串接 publishers');
    assert.equal(targetFrontendBook.available_copies, 2, '初始可借閱副本應為 2 本');
    console.log(`✅ [原則 A 通過] 書目 (${testIsbn}) 與 2 筆副本分離建立，前端關聯查詢完全一致！\n`);

    // ------------------------------------------------------------------------
    // 測試原則 D：避免重複借出（模擬兩位館員同時對同一本副本發起借閱交易）
    // ------------------------------------------------------------------------
    console.log('▶ [測試原則 D] 模擬兩位館員併發同時借出同一條碼副本...');
    const concurrentResults = await Promise.allSettled([
      libraryService.borrowCopy(reader1.userId, barcode1, 14),
      libraryService.borrowCopy(reader2.userId, barcode1, 14),
    ]);

    const fulfilled = concurrentResults.filter((r) => r.status === 'fulfilled');
    const rejected = concurrentResults.filter((r) => r.status === 'rejected');

    assert.equal(fulfilled.length, 1, '併發借閱同一副本時，僅能有 1 筆交易成功');
    assert.equal(rejected.length, 1, '併發借閱同一副本時，另 1 筆交易必須被鎖定阻擋');
    console.log(`   ✔ 併發結果：1 筆成功，1 筆被成功攔截 (${rejected[0].reason.message})`);

    const booksAfterBorrow = await libraryService.getBooksWithCopies();
    const updatedBook = booksAfterBorrow.find((b) => b.id === createdBookId);
    assert.equal(updatedBook.available_copies, 1, '借出一本後，可借閱副本應即時更新為 1 本');

    const winnerLoanId = fulfilled[0].value.loan_id;
    const winnerLoanItemId = fulfilled[0].value.loan_item_id;
    const winnerDueDateMs = new Date(fulfilled[0].value.due_date).getTime();
    console.log(`✅ [原則 D 通過] 資料庫 FOR UPDATE 鎖定成功杜絕重複借出！\n`);

    // ------------------------------------------------------------------------
    // 測試原則 B：借閱紀錄不可直接刪除（即使嘗試直接對 loans / loan_items 執行 DELETE）
    // ------------------------------------------------------------------------
    console.log('▶ [測試原則 B] 驗證借閱主表 (loans) 與明細 (loan_items) 不可直接刪除...');
    const { error: delItemErr } = await supabase
      .from('loan_items')
      .delete()
      .eq('id', winnerLoanItemId);
    assert.ok(delItemErr, '資料庫觸發器必須阻擋直接刪除 loan_items');

    const { error: delLoanErr } = await supabase
      .from('loans')
      .delete()
      .eq('id', winnerLoanId);
    assert.ok(delLoanErr, '資料庫觸發器必須阻擋直接刪除 loans');
    console.log(`   ✔ 刪除攔截訊息：${delLoanErr.message}`);
    console.log('✅ [原則 B 通過] 借閱歷史紀錄受資料庫層級保護，無法直接刪除！\n');

    // ------------------------------------------------------------------------
    // 測試原則 C：所有金額都要保留獨立交易紀錄 (fines + payments 繳費/折抵/退款流水)
    // ------------------------------------------------------------------------
    console.log('▶ [測試原則 C] 驗證逾期罰款產生及獨立繳費/折抵/退款交易流水...');
    // 以實際應還時間 (due_date) 往後加 5 天 12 小時，確保 CEIL(5.5) 精準無誤差為 6 天（罰款 30 元）
    const simulatedReturnTime = new Date(winnerDueDateMs + (5 * 24 + 12) * 60 * 60 * 1000).toISOString();
    const returnRes = await libraryService.returnCopy(barcode1, simulatedReturnTime);

    assert.equal(returnRes.overdue_days, 6, '逾期天數應為 6 天');
    assert.equal(Number(returnRes.fine_amount), 30, '逾期罰款應為 30 元');
    assert.ok(returnRes.fine_id, '應建立獨立 fines 罰款紀錄');

    // 1. 繳費 20 元 -> 狀態應為 partially_paid
    const pay1 = await libraryService.payOrAdjustFine(
      returnRes.fine_id,
      'payment',
      20,
      'cash',
      reader1.userId,
      '現金部分繳納'
    );
    assert.equal(pay1.fine_status, 'partially_paid', '繳納 20/30 元後狀態應為 partially_paid');

    // 2. 折抵 10 元 -> 狀態應轉為 paid
    const pay2 = await libraryService.payOrAdjustFine(
      returnRes.fine_id,
      'waiver',
      10,
      'waive_auth',
      reader1.userId,
      '閱讀推廣活動折抵'
    );
    assert.equal(pay2.fine_status, 'paid', '再折抵 10 元後總實收 30 元，狀態應為 paid');

    // 3. 退款 5 元 -> 狀態應退回 partially_paid，且 payments 保留全部 3 筆不可變流水
    const pay3 = await libraryService.payOrAdjustFine(
      returnRes.fine_id,
      'refund',
      5,
      'refund_cash',
      reader1.userId,
      '溢收折抵退回'
    );
    assert.equal(Number(pay3.net_paid), 25, '退款 5 元後淨實收應為 25 元');
    assert.equal(pay3.fine_status, 'partially_paid', '退款後狀態應準確反映為 partially_paid');

    // 驗證前端會員借閱與帳務歷史查詢 (getMemberLoanHistory)
    const { data: loanRow } = await supabase
      .from('loans')
      .select('member_id')
      .eq('id', winnerLoanId)
      .single();

    const history = await libraryService.getMemberLoanHistory(loanRow.member_id);
    const fineRecord = history[0]?.loan_items?.[0]?.fines?.[0];
    assert.equal(fineRecord.payments.length, 3, 'payments 表應完整保留 3 筆獨立財務交易流水');

    // 驗證財務流水亦不可直接刪除
    const { error: delPayErr } = await supabase
      .from('payments')
      .delete()
      .eq('id', fineRecord.payments[0].id);
    assert.ok(delPayErr, '資料庫必須阻擋直接刪除 payments 財務交易流水');

    console.log('✅ [原則 C 通過] 罰款、部分繳費、折抵與退款皆以獨立流水保存且禁止刪除！\n');
    console.log('🎉 恭喜！資料庫架構四大核心設計原則與前後端整合測試全數驗證通過！');
  } finally {
    if (createdBookId) {
      await supabase.from('book_copies').delete().eq('book_id', createdBookId).eq('status', 'available');
    }
    console.log('🧹 測試收尾完成。');
  }
}

runDatabaseArchitectureTests().catch((err) => {
  console.error('\n❌ 資料庫架構整合測試失敗：', err);
  process.exit(1);
});
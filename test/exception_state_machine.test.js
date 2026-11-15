/**
 * test/exception_state_machine.test.js
 * 第六個重要思維：異常情境與例外處理 + 館藏有限狀態機（State Machine）
 * 前後端實際操作整合測試
 *
 * 執行方式：
 *   npm run test:exception
 *   或：node --env-file=.env test/exception_state_machine.test.js
 */
import assert from 'node:assert/strict';
import { supabase } from '../src/lib/supabase.js';
import { libraryService } from '../src/lib/libraryService.js';
import { exceptionHandlerService } from '../src/lib/exceptionHandlerService.js';
import { useLibraryStore } from '../src/store/useLibraryStore.js';
import {
  COPY_STATES,
  COPY_EVENTS,
  copyStateMachine,
  LibraryBusinessError,
} from '../src/config/copyStateMachine.js';

async function createTestMember(tag, maxQuota = 5) {
  const unique = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const email = `exc_${tag}_${unique}@example.com`;
  const password = 'TestPassword123!';

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data?.user?.id) {
    throw new Error(`建立測試帳號 (${tag}) 失敗: ${error?.message || '無 user.id'}`);
  }

  const member = await libraryService.ensureMemberProfile(
    data.user.id,
    email,
    `異常測試讀者_${tag}`
  );

  // 更新自訂借閱上限（用於測試借閱上限異常）
  const { data: updatedMember } = await supabase
    .from('members')
    .update({ max_borrow_quota: maxQuota })
    .eq('id', member.id)
    .select()
    .single();

  return { user: data.user, email, member: updatedMember || member };
}

async function runExceptionAndStateMachineTests() {
  console.log('====================================================================');
  console.log('🛡️  開始執行「異常情境與例外處理 + 館藏狀態機」前後端整合測試');
  console.log('====================================================================\n');

  let readerNormal = null;
  let readerSuspended = null;
  let readerSecond = null;
  let createdBookId = null;
  const createdRetryIds = [];

  try {
    // ========================================================================
    // 第一部分：前端館藏狀態機 (State Machine) 轉換規則與非法跳轉阻擋測試
    // ========================================================================
    console.log('▶ [第一部分] 驗證館藏狀態機 (6 大狀態) 合法與非法轉換規則...');

    // 1. 合法轉換路徑驗證
    assert.equal(
      copyStateMachine.transitionByEvent(COPY_STATES.AVAILABLE, COPY_EVENTS.BORROW),
      COPY_STATES.BORROWED,
      'Available -> Borrow 應轉換為 Borrowed'
    );
    assert.equal(
      copyStateMachine.transitionByEvent(COPY_STATES.BORROWED, COPY_EVENTS.HOLD_FOR_RESERVE),
      COPY_STATES.RESERVED,
      'Borrowed -> HoldForReserve 應轉換為 Reserved'
    );
    assert.equal(
      copyStateMachine.transitionByEvent(COPY_STATES.BORROWED, COPY_EVENTS.REPORT_DAMAGE),
      COPY_STATES.MAINTENANCE,
      'Borrowed -> ReportDamage 應轉換為 Maintenance'
    );
    assert.equal(
      copyStateMachine.transitionByEvent(COPY_STATES.MAINTENANCE, COPY_EVENTS.REPAIR_COMPLETE),
      COPY_STATES.AVAILABLE,
      'Maintenance -> RepairComplete 應轉換為 Available'
    );
    assert.equal(
      copyStateMachine.transitionByEvent(COPY_STATES.BORROWED, COPY_EVENTS.REPORT_LOST),
      COPY_STATES.LOST,
      'Borrowed -> ReportLost 應轉換為 Lost'
    );
    assert.equal(
      copyStateMachine.transitionByEvent(COPY_STATES.LOST, COPY_EVENTS.DISPOSE),
      COPY_STATES.DISPOSED,
      'Lost -> Dispose 應轉換為 Disposed'
    );

    // 2. 非法狀態跳轉阻擋驗證
    assert.throws(
      () => copyStateMachine.transitionByEvent(COPY_STATES.BORROWED, COPY_EVENTS.DISPOSE),
      (err) => err instanceof LibraryBusinessError && err.code === 'INVALID_STATE_TRANSITION',
      '借出中的書籍不可直接報廢 (Borrowed -> Disposed)'
    );
    assert.throws(
      () => copyStateMachine.transitionByEvent(COPY_STATES.MAINTENANCE, COPY_EVENTS.BORROW),
      (err) => err instanceof LibraryBusinessError && err.code === 'INVALID_STATE_TRANSITION',
      '維修中的書籍不可直接借出 (Maintenance -> Borrowed)'
    );
    assert.throws(
      () => copyStateMachine.transitionByEvent(COPY_STATES.DISPOSED, COPY_EVENTS.REPAIR_COMPLETE),
      (err) => err instanceof LibraryBusinessError && err.code === 'INVALID_STATE_TRANSITION',
      '報廢為終態，不可再轉回在館 (Disposed -> Available)'
    );

    console.log('✅ [第一部分通過] 館藏狀態機所有合法路徑與非法跨狀態阻擋皆驗證成功！\n');

    // ========================================================================
    // 第二部分：前後端 Supabase 實際資料庫與前端 Store 整合測試（10 大異常情境）
    // ========================================================================
    console.log('▶ [前置準備] 建立測試讀者帳號與正規化館藏副本...');
    [readerNormal, readerSuspended, readerSecond] = await Promise.all([
      createTestMember('normal', 1),    // 借閱上限設為 1 本，便於驗證借閱上限
      createTestMember('suspended', 5), // 稍後設為停權狀態
      createTestMember('second', 5),    // 第二位讀者（用於測試重複借出與候補預約）
    ]);

    const testIsbn = `978986${Math.floor(1000000 + Math.random() * 9000000)}`;
    const barcodeMain = `${testIsbn}-C001`;
    const barcodeExtra = `${testIsbn}-C002`;
    const barcodeDamaged = `${testIsbn}-C003`;
    const barcodeLost = `${testIsbn}-C004`;

    const created = await libraryService.createNormalizedBookWithCopies(
      {
        isbn: testIsbn,
        title: '高可靠分散式系統與異常處理實戰',
        author: '張架構',
        publisher: '全端工程出版社',
        categoryCode: '312',
        category: '軟體工程',
      },
      [
        { barcode: barcodeMain },
        { barcode: barcodeExtra },
        { barcode: barcodeDamaged },
        { barcode: barcodeLost },
      ]
    );
    createdBookId = created.book.id;
    const copyDamagedObj = created.copies.find((c) => c.barcode === barcodeDamaged);
    const copyLostObj = created.copies.find((c) => c.barcode === barcodeLost);

    // 同步前端 Zustand Store
    await useLibraryStore.getState().syncAuthSession(readerNormal.user);
    await useLibraryStore.getState().fetchBooks();
    console.log(`✅ 測試環境建置完成（ISBN: ${testIsbn}，共建立 4 筆實體副本）\n`);

    // ------------------------------------------------------------------------
    // 情境 1：讀者已停權 -> 禁止借閱
    // ------------------------------------------------------------------------
    console.log('▶ [異常情境 1] 測試「讀者已停權 -> 禁止借閱」...');
    await supabase
      .from('members')
      .update({ status: 'suspended' })
      .eq('id', readerSuspended.member.id);

    await assert.rejects(
      () =>
        exceptionHandlerService.safeBorrowCopy({
          userId: readerSuspended.user.id,
          barcode: barcodeMain,
        }),
      (err) => err.code === 'MEMBER_SUSPENDED',
      '已停權讀者必須被禁止借閱'
    );
    console.log('✅ [情境 1 通過] 成功攔截已停權讀者借閱請求！\n');

    // ------------------------------------------------------------------------
    // 情境 2：已達借閱上限 -> 禁止新增借閱
    // ------------------------------------------------------------------------
    console.log('▶ [異常情境 2] 測試「已達借閱上限 -> 禁止新增借閱」...');
    // readerNormal 上限為 1 本，先借第 1 本 (barcodeMain)
    const firstLoan = await exceptionHandlerService.safeBorrowCopy({
      userId: readerNormal.user.id,
      barcode: barcodeMain,
      loanDays: 14,
    });
    assert.equal(firstLoan.copy_status, COPY_STATES.BORROWED);

    // 嘗試借第 2 本 (barcodeExtra) 應被上限阻擋
    await assert.rejects(
      () =>
        exceptionHandlerService.safeBorrowCopy({
          userId: readerNormal.user.id,
          barcode: barcodeExtra,
        }),
      (err) => err.code === 'BORROW_QUOTA_EXCEEDED',
      '超過借閱上限時必須禁止新增借閱'
    );
    console.log('✅ [情境 2 通過] 成功攔截超過借閱上限 (1/1) 的借閱請求！\n');

    // ------------------------------------------------------------------------
    // 情境 3：書籍已被借出 -> 禁止重複借閱
    // ------------------------------------------------------------------------
    console.log('▶ [異常情境 3] 測試「書籍已被借出 -> 禁止重複借閱」...');
    await assert.rejects(
      () =>
        exceptionHandlerService.safeBorrowCopy({
          userId: readerSecond.user.id,
          barcode: barcodeMain,
        }),
      (err) => err.code === 'INVALID_STATE_TRANSITION' || err.code === 'COPY_ALREADY_BORROWED',
      '已被借出的副本禁止其他人重複借閱'
    );
    console.log('✅ [情境 3 通過] 成功攔截對已借出副本的重複借閱！\n');

    // ------------------------------------------------------------------------
    // 情境 4：讀者重複預約 -> 防止重複建立
    // ------------------------------------------------------------------------
    console.log('▶ [異常情境 4] 測試「讀者重複預約 -> 防止重複建立」...');
    const resv1 = await exceptionHandlerService.safeCreateReservation({
      userId: readerSecond.user.id,
      bookId: createdBookId,
    });
    assert.equal(resv1.queue_position, 1);

    await assert.rejects(
      () =>
        exceptionHandlerService.safeCreateReservation({
          userId: readerSecond.user.id,
          bookId: createdBookId,
        }),
      (err) => err.code === 'DUPLICATE_RESERVATION',
      '同一讀者不可重複預約同一本書'
    );
    console.log('✅ [情境 4 通過] 成功防止同一讀者重複建立預約！\n');

    // ------------------------------------------------------------------------
    // 情境 5 & 10：歸還時系統中斷 (交易一致性 ACID Rollback) + Email 寄送失敗重試佇列
    // ------------------------------------------------------------------------
    console.log('▶ [異常情境 5 & 10] 測試「歸還時系統中斷回滾」與「Email 寄送失敗重試紀錄」...');

    // 5-1. 模擬歸還寫入一半發生系統崩潰 (simulateCrash: true)
    await assert.rejects(
      () =>
        exceptionHandlerService.safeReturnCopy({
          barcode: barcodeMain,
          simulateCrash: true,
        }),
      (err) => err.code === 'SIMULATED_SYSTEM_CRASH',
      '模擬系統中斷應拋出異常並觸發交易回滾'
    );

    // 驗證資料庫狀態未被污染（副本仍為 borrowed，借閱明細仍為 borrowed）
    const { data: copyAfterCrash } = await supabase
      .from('book_copies')
      .select('status')
      .eq('barcode', barcodeMain)
      .single();
    assert.equal(
      copyAfterCrash.status,
      COPY_STATES.BORROWED,
      '交易回滾後，副本狀態必須維持 borrowed，不可產生半套資料'
    );

    // 5-2. 正常歸還 + 注入會失敗的 Email 寄送器（驗證狀態轉為 reserved 且保留重試紀錄）
    const failingEmailSender = async () => {
      throw new Error('SMTP 550 Connection Timeout');
    };

    const returnWithResv = await exceptionHandlerService.safeReturnCopy({
      barcode: barcodeMain,
      emailSender: failingEmailSender,
    });

    assert.equal(
      returnWithResv.next_copy_status,
      COPY_STATES.RESERVED,
      '有預約候補時，歸還後館藏狀態應自動轉換為 reserved'
    );
    assert.equal(returnWithResv.notificationResult?.sent, false);
    assert.equal(returnWithResv.notificationResult?.queuedForRetry, true);
    if (returnWithResv.notificationResult?.retryRecord?.id) {
      createdRetryIds.push(returnWithResv.notificationResult.retryRecord.id);
    }

    // 驗證排程重試補發機制
    const retryProcessed = await exceptionHandlerService.processNotificationRetryQueue(
      async () => ({ messageId: 'recovered-msg-001' })
    );
    const recoveredItem = retryProcessed.find(
      (r) => r.id === returnWithResv.notificationResult.retryRecord.id
    );
    assert.equal(recoveredItem?.status, 'SENT', '重試佇列應能成功補發並更新狀態為 SENT');
    console.log('✅ [情境 5 & 10 通過] 歸還交易原子性回滾與 Email 失敗重試補發皆驗證成功！\n');

    // ------------------------------------------------------------------------
    // 情境 6：書籍已被預約 -> 依候補規則處理（非預約人禁止借閱，預約人可借閱）
    // ------------------------------------------------------------------------
    console.log('▶ [異常情境 6] 測試「書籍已被預約 -> 依候補規則處理」...');
    // 非預約人 (readerNormal) 嘗試借閱 reserved 副本應被拒絕
    await assert.rejects(
      () =>
        exceptionHandlerService.safeBorrowCopy({
          userId: readerNormal.user.id,
          barcode: barcodeMain,
        }),
      (err) => err.code === 'COPY_RESERVED_BY_OTHER',
      '非保留預約人不可搶借 Reserved 書籍'
    );

    // 第一順位預約人 (readerSecond) 借閱 reserved 副本應成功
    const reservedPickupLoan = await exceptionHandlerService.safeBorrowCopy({
      userId: readerSecond.user.id,
      barcode: barcodeMain,
    });
    assert.equal(reservedPickupLoan.copy_status, COPY_STATES.BORROWED);
    console.log('✅ [情境 6 通過] 預約保留書僅允許候補第一順位讀者取書借閱！\n');

    // ------------------------------------------------------------------------
    // 情境 7：讀者有逾期書籍 -> 依規則限制借閱
    // ------------------------------------------------------------------------
    console.log('▶ [異常情境 7] 測試「讀者有逾期書籍 -> 依規則限制借閱」...');
    // 將 readerSecond 目前借閱明細的 due_date 改為 3 天前（模擬逾期未還）
    await supabase
      .from('loan_items')
      .update({ due_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() })
      .eq('id', reservedPickupLoan.loan_item_id);

    await assert.rejects(
      () =>
        exceptionHandlerService.safeBorrowCopy({
          userId: readerSecond.user.id,
          barcode: barcodeExtra,
        }),
      (err) => err.code === 'MEMBER_HAS_OVERDUE',
      '尚有逾期未還書籍的讀者應被限制新增借閱'
    );
    console.log('✅ [情境 7 通過] 成功攔截尚有逾期未還書籍之讀者新增借閱！\n');

    // ------------------------------------------------------------------------
    // 情境 8 & 9：書籍損壞（進入維修狀態）與書籍遺失（更新狀態並保留紀錄）
    // ------------------------------------------------------------------------
    console.log('▶ [異常情境 8 & 9] 測試「書籍損壞進入維修」與「書籍遺失保留紀錄」...');

    // 8. 書籍損壞 -> Maintenance
    const maintainedCopy = await exceptionHandlerService.transitionCopyState({
      copyId: copyDamagedObj.id,
      eventName: COPY_EVENTS.REPORT_DAMAGE,
      reason: '封面脫膠與內頁破損，送裝訂室修補',
    });
    assert.equal(maintainedCopy.status, COPY_STATES.MAINTENANCE);

    // 維修中不可被借閱
    await assert.rejects(
      () =>
        exceptionHandlerService.safeBorrowCopy({
          userId: readerNormal.user.id,
          barcode: barcodeDamaged,
        }),
      (err) => err.code === 'INVALID_STATE_TRANSITION'
    );

    // 9. 書籍遺失 -> Lost -> 確認無法找回轉 Disposed -> 驗證終態不可再修改
    const lostCopy = await exceptionHandlerService.transitionCopyState({
      copyId: copyLostObj.id,
      eventName: COPY_EVENTS.REPORT_LOST,
      reason: '讀者通報遺失，已開立賠償單',
    });
    assert.equal(lostCopy.status, COPY_STATES.LOST);

    const disposedCopy = await exceptionHandlerService.transitionCopyState({
      copyId: copyLostObj.id,
      eventName: COPY_EVENTS.DISPOSE,
      reason: '逾 60 日未尋獲，依館藏管理辦法報廢除帳',
    });
    assert.equal(disposedCopy.status, COPY_STATES.DISPOSED);

    // 驗證資料庫層級 Trigger 阻擋直接修改 Disposed 狀態
    const { error: dbTriggerErr } = await supabase
      .from('book_copies')
      .update({ status: 'available' })
      .eq('id', copyLostObj.id);
    assert.ok(
      dbTriggerErr && dbTriggerErr.message.includes('STATE_MACHINE_VIOLATION'),
      '資料庫 Trigger 必須阻擋將 Disposed 狀態直接改回 Available'
    );

    // 同步前端 Store 並驗證前端快取狀態一致
    const refreshedBooks = await useLibraryStore.getState().fetchBooks();
    const targetBook = refreshedBooks.find((b) => b.id === createdBookId);
    assert.equal(targetBook.available_copies, 1, '4 本副本中 1 本借出、1 本維修、1 本報廢，僅剩 1 本在館');

    console.log('✅ [情境 8 & 9 通過] 損壞維修、遺失報廢與資料庫 Trigger 狀態機防護完全一致！\n');
    console.log('🎉 所有狀態機與 10 大異常情境前後端實際操作整合測試全數通過！');
  } finally {
    // 清理測試資料
    if (createdRetryIds.length > 0) {
      await supabase.from('notification_retry_queue').delete().in('id', createdRetryIds);
    }
    if (createdBookId) {
      await supabase.from('books').delete().eq('id', createdBookId);
    }
  }
}

runExceptionAndStateMachineTests().catch((err) => {
  console.error('\n❌ 測試執行失敗：', err);
  process.exit(1);
});
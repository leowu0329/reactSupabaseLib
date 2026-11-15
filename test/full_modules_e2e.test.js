import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

/**
 * 模擬前後端整合測試環境（涵蓋 A~F 六大模組完整狀態機與資料驗證）
 * 執行指令: node --test test/full_modules_e2e.test.js
 */
class LibraryTestHarness {
  constructor() {
    this.db = {
      tiers: [
        { id: 't-student', tier_code: 'STUDENT', max_borrow_quota: 2, loan_period_days: 14, max_renew_times: 1, daily_fine_rate: 5, max_fine_cap: 100 },
        { id: 't-public', tier_code: 'PUBLIC', max_borrow_quota: 1, loan_period_days: 7, max_renew_times: 1, daily_fine_rate: 10, max_fine_cap: 50 }
      ],
      branches: [
        { id: 'b-main', branch_code: 'MAIN', branch_name: '總館' },
        { id: 'b-east', branch_code: 'EAST', branch_name: '東區分館' }
      ],
      members: [],
      books: [],
      copies: [],
      borrows: [],
      reservations: [],
      fines: [],
      violations: []
    };
  }

  // [A] 館藏管理：ISBN 匯入與多副本條碼建立
  importBookWithCopies({ isbn, title, category, branchId, shelfLocation, copyCount }) {
    const book = { id: `book-${this.db.books.length + 1}`, isbn, title, category };
    this.db.books.push(book);
    const createdCopies = [];
    for (let i = 1; i <= copyCount; i++) {
      const copy = {
        id: `copy-${this.db.copies.length + 1}`,
        book_id: book.id,
        barcode: `LIB-${isbn.slice(-4)}-${String(i).padStart(3, '0')}`,
        branch_id: branchId,
        shelf_location: shelfLocation,
        status: 'AVAILABLE'
      };
      this.db.copies.push(copy);
      createdCopies.push(copy);
    }
    return { book, copies: createdCopies };
  }

  // [A] 館藏狀態變更（遺失/損壞/報廢）
  setCopyCondition(copyId, status) {
    const copy = this.db.copies.find((c) => c.id === copyId);
    copy.status = status;
    return copy;
  }

  // [B] 讀者註冊
  registerMember({ fullName, tierCode }) {
    const tier = this.db.tiers.find((t) => t.tier_code === tierCode);
    const member = {
      id: `mem-${this.db.members.length + 1}`,
      card_number: `CARD-2026-${1000 + this.db.members.length}`,
      full_name: fullName,
      tier,
      status: 'ACTIVE',
      violation_points: 0
    };
    this.db.members.push(member);
    return member;
  }

  // [C] 借閱（含資格檢查、跨館判斷、保留書驗證）
  borrowCopy({ barcode, memberId, currentBranchId, borrowDate = new Date('2026-11-01T10:00:00Z') }) {
    const member = this.db.members.find((m) => m.id === memberId);
    if (member.status !== 'ACTIVE') throw new Error(`讀者狀態異常: ${member.status}`);

    const unpaid = this.db.fines.filter((f) => f.member_id === memberId && f.status === 'UNPAID');
    if (unpaid.length > 0) throw new Error('尚有未繳罰款，禁止借閱');

    const activeCount = this.db.borrows.filter((b) => b.member_id === memberId && b.status === 'ACTIVE').length;
    if (activeCount >= member.tier.max_borrow_quota) throw new Error('已達借閱數量上限');

    const copy = this.db.copies.find((c) => c.barcode === barcode);
    if (!copy) throw new Error('條碼不存在');

    if (copy.status === 'RESERVED') {
      const resv = this.db.reservations.find((r) => r.assigned_copy_id === copy.id && r.status === 'READY_FOR_PICKUP');
      if (!resv || resv.member_id !== memberId) throw new Error('此書已保留給其他預約者');
      resv.status = 'FULFILLED';
    } else if (copy.status !== 'AVAILABLE') {
      throw new Error(`無法借閱狀態為 ${copy.status} 的書籍`);
    }

    const dueDate = new Date(borrowDate);
    dueDate.setDate(dueDate.getDate() + member.tier.loan_period_days);

    const record = {
      id: `brw-${this.db.borrows.length + 1}`,
      copy_id: copy.id,
      member_id: memberId,
      is_interlibrary: copy.branch_id !== currentBranchId,
      borrowed_at: borrowDate.toISOString(),
      due_date: dueDate.toISOString(),
      returned_at: null,
      renew_count: 0,
      status: 'ACTIVE'
    };
    this.db.borrows.push(record);
    copy.status = 'BORROWED';
    return record;
  }

  // [C] 續借
  renewBorrow(borrowId) {
    const record = this.db.borrows.find((b) => b.id === borrowId);
    const member = this.db.members.find((m) => m.id === record.member_id);
    const copy = this.db.copies.find((c) => c.id === record.copy_id);

    const hasWaiting = this.db.reservations.some((r) => r.book_id === copy.book_id && r.status === 'WAITING');
    if (hasWaiting) throw new Error('已有其他讀者預約此書，不可續借');
    if (record.renew_count >= member.tier.max_renew_times) throw new Error('已達續借次數上限');

    const newDue = new Date(record.due_date);
    newDue.setDate(newDue.getDate() + member.tier.loan_period_days);
    record.due_date = newDue.toISOString();
    record.renew_count += 1;
    return record;
  }

  // [D] 建立預約
  createReservation({ bookId, memberId }) {
    const queuePos = this.db.reservations.filter((r) => r.book_id === bookId && r.status === 'WAITING').length + 1;
    const resv = {
      id: `resv-${this.db.reservations.length + 1}`,
      book_id: bookId,
      member_id: memberId,
      assigned_copy_id: null,
      queue_position: queuePos,
      status: 'WAITING'
    };
    this.db.reservations.push(resv);
    return resv;
  }

  // [C/D/E] 歸還（自動結算罰款 + 停權判定 + 觸發下一位預約到館）
  returnCopy({ barcode, returnDate = new Date('2026-11-10T10:00:00Z') }) {
    const copy = this.db.copies.find((c) => c.barcode === barcode);
    const record = this.db.borrows.find((b) => b.copy_id === copy.id && b.status === 'ACTIVE');
    record.returned_at = returnDate.toISOString();
    record.status = 'RETURNED';

    // [E] 逾期與罰款計算
    const overdueDays = Math.ceil((returnDate - new Date(record.due_date)) / (1000 * 60 * 60 * 24));
    let fine = null;
    if (overdueDays > 0) {
      const member = this.db.members.find((m) => m.id === record.member_id);
      const rawAmount = overdueDays * member.tier.daily_fine_rate;
      const cappedAmount = Math.min(rawAmount, member.tier.max_fine_cap);
      fine = {
        id: `fine-${this.db.fines.length + 1}`,
        borrow_id: record.id,
        member_id: member.id,
        overdue_days: overdueDays,
        calculated_amount: cappedAmount,
        paid_amount: 0,
        waived_amount: 0,
        status: 'UNPAID'
      };
      this.db.fines.push(fine);

      if (overdueDays >= 7) {
        member.violation_points += 3;
        member.status = 'SUSPENDED';
      }
    }

    // [D] 預約候補轉保留
    const nextResv = this.db.reservations
      .filter((r) => r.book_id === copy.book_id && r.status === 'WAITING')
      .sort((a, b) => a.queue_position - b.queue_position)[0];

    if (nextResv) {
      nextResv.status = 'READY_FOR_PICKUP';
      nextResv.assigned_copy_id = copy.id;
      copy.status = 'RESERVED';
    } else {
      copy.status = 'AVAILABLE';
    }

    return { record, fine, assignedReservation: nextResv || null };
  }

  // [E] 罰款繳費與減免
  settleFine(fineId, { payAmount = 0, waiveAmount = 0 }) {
    const fine = this.db.fines.find((f) => f.id === fineId);
    fine.paid_amount += payAmount;
    fine.waived_amount += waiveAmount;
    if (fine.paid_amount + fine.waived_amount >= fine.calculated_amount) {
      fine.status = fine.waived_amount > 0 && fine.paid_amount === 0 ? 'WAIVED' : 'PAID';
    }
    return fine;
  }

  // [F] 統計 Dashboard 指標
  getDashboard() {
    const validCopies = this.db.copies.filter((c) => !['LOST', 'DISCARDED'].includes(c.status));
    const totalBooks = validCopies.length;
    const availableBooks = validCopies.filter((c) => c.status === 'AVAILABLE').length;
    const borrowedBooks = validCopies.filter((c) => c.status === 'BORROWED').length;
    const utilizationRate = Number(((borrowedBooks / totalBooks) * 100).toFixed(2));
    return {
      totalBooks,
      availableBooks,
      borrowedBooks,
      utilizationRate,
      waitingReservations: this.db.reservations.filter((r) => ['WAITING', 'READY_FOR_PICKUP'].includes(r.status)).length
    };
  }
}

describe('圖書館管理系統 - 六大完整功能模組 (A~F) 前後端整合測試', () => {
  const app = new LibraryTestHarness();
  let bookA, bookB, studentAlice, publicBob;

  before(() => {
    // 初始化測試資料
    bookA = app.importBookWithCopies({
      isbn: '9789861234567',
      title: '系統架構設計實戰',
      category: '電腦科學',
      branchId: 'b-main',
      shelfLocation: '3F-A01',
      copyCount: 2
    });
    bookB = app.importBookWithCopies({
      isbn: '9789867654321',
      title: '資料庫核心原理',
      category: '電腦科學',
      branchId: 'b-east',
      shelfLocation: '2F-B05',
      copyCount: 1
    });
    studentAlice = app.registerMember({ fullName: '王小明 (學生)', tierCode: 'STUDENT' });
    publicBob = app.registerMember({ fullName: '陳大華 (民眾)', tierCode: 'PUBLIC' });
  });

  it('[模組 A] 館藏管理：多副本條碼建立與報廢狀態排除', () => {
    assert.equal(bookA.copies.length, 2);
    assert.equal(bookA.copies[0].barcode, 'LIB-4567-001');

    // 將第二本副本標記為報廢 (DISCARDED)
    app.setCopyCondition(bookA.copies[1].id, 'DISCARDED');
    const stats = app.getDashboard();
    assert.equal(stats.totalBooks, 2, '報廢書籍不應計入有效館藏總數');
  });

  it('[模組 B & C] 讀者借閱額度限制、跨館借閱與續借功能', () => {
    // 民眾 Bob 額度為 1 本，在總館借閱位於東區分館的 bookB（觸發跨館借閱）
    const borrow1 = app.borrowCopy({
      barcode: bookB.copies[0].barcode,
      memberId: publicBob.id,
      currentBranchId: 'b-main',
      borrowDate: new Date('2026-11-01T10:00:00Z')
    });
    assert.equal(borrow1.is_interlibrary, true, '應標記為跨館借閱');

    // 超過額度第 2 本應被阻擋
    assert.throws(() => {
      app.borrowCopy({
        barcode: bookA.copies[0].barcode,
        memberId: publicBob.id,
        currentBranchId: 'b-main'
      });
    }, /已達借閱數量上限/);

    // 正常續借一次
    const renewed = app.renewBorrow(borrow1.id);
    assert.equal(renewed.renew_count, 1);
  });

  it('[模組 D] 線上預約候補排序、有預約時禁止續借、歸還自動轉保留', () => {
    // Alice 借走 bookA 第一本
    const aliceBorrow = app.borrowCopy({
      barcode: bookA.copies[0].barcode,
      memberId: studentAlice.id,
      currentBranchId: 'b-main',
      borrowDate: new Date('2026-11-01T10:00:00Z')
    });

    // Bob 先歸還 bookB 以恢復額度，接著線上預約 bookA
    app.returnCopy({ barcode: bookB.copies[0].barcode, returnDate: new Date('2026-11-05T10:00:00Z') });
    const resvBob = app.createReservation({ bookId: bookA.book.id, memberId: publicBob.id });
    assert.equal(resvBob.queue_position, 1);

    // 因為 Bob 正在預約 bookA，Alice 嘗試續借必須被拒絕
    assert.throws(() => {
      app.renewBorrow(aliceBorrow.id);
    }, /已有其他讀者預約此書，不可續借/);

    // Alice 歸還 bookA -> 系統自動將副本轉為 RESERVED 並指派給候補第一名的 Bob
    const returnRes = app.returnCopy({
      barcode: bookA.copies[0].barcode,
      returnDate: new Date('2026-11-10T10:00:00Z')
    });
    assert.equal(returnRes.assignedReservation.member_id, publicBob.id);
    assert.equal(bookA.copies[0].status, 'RESERVED');

    // 非預約人 Alice 嘗試搶借保留書必須失敗
    assert.throws(() => {
      app.borrowCopy({
        barcode: bookA.copies[0].barcode,
        memberId: studentAlice.id,
        currentBranchId: 'b-main'
      });
    }, /此書已保留給其他預約者/);

    // 預約人 Bob 成功取書借出
    const pickupBorrow = app.borrowCopy({
      barcode: bookA.copies[0].barcode,
      memberId: publicBob.id,
      currentBranchId: 'b-main',
      borrowDate: new Date('2026-11-11T10:00:00Z')
    });
    assert.equal(pickupBorrow.status, 'ACTIVE');
  });

  it('[模組 E] 逾期罰款上限計算、嚴重逾期自動停權、繳費與減免', () => {
    // Bob 借期 7 天（11/11 借，11/18 到期），延遲至 11/28 歸還（逾期 10 天）
    // 民眾日罰 10 元 * 10 天 = 100 元，但民眾罰款上限為 50 元
    const overdueReturn = app.returnCopy({
      barcode: bookA.copies[0].barcode,
      returnDate: new Date('2026-11-28T10:00:00Z')
    });

    assert.equal(overdueReturn.fine.overdue_days, 10);
    assert.equal(overdueReturn.fine.calculated_amount, 50, '應套用罰款上限 50 元');
    assert.equal(publicBob.status, 'SUSPENDED', '逾期達 7 天以上應自動觸發讀者停權');

    // 櫃台執行部分減免 20 元 + 繳費 30 元結清罰款
    const settled = app.settleFine(overdueReturn.fine.id, { waiveAmount: 20, payAmount: 30 });
    assert.equal(settled.status, 'PAID');
  });

  it('[模組 F] 統計分析 Dashboard 指標精準度驗證', () => {
    const dashboard = app.getDashboard();
    assert.equal(dashboard.totalBooks, 2);
    assert.equal(dashboard.availableBooks, 2);
    assert.equal(dashboard.borrowedBooks, 0);
    assert.equal(dashboard.utilizationRate, 0);
    assert.equal(dashboard.waitingReservations, 0);
  });
});
import { supabase } from './supabase.js';
import { memberService } from './memberService.js';
import { fineService } from './fineService.js';
import { reservationService } from './reservationService.js';

export const circulationService = {
  // 1. 單本借閱（含資格檢查、跨館判斷、到期日自動計算）
  async borrowBook({ barcode, memberId, currentBranchId }) {
    const eligibility = await memberService.checkBorrowEligibility(memberId);
    if (!eligibility.eligible) {
      throw new Error(eligibility.reason);
    }

    const { data: copy, error: copyErr } = await supabase
      .from('book_copies')
      .select('*, book:books(*)')
      .eq('barcode', barcode)
      .single();

    if (copyErr || !copy) throw new Error(`找不到條碼為 ${barcode} 的館藏`);

    // 若為預約保留書，驗證是否為該預約人
    if (copy.status === 'RESERVED') {
      const { data: resv } = await supabase
        .from('reservations')
        .select('*')
        .eq('assigned_copy_id', copy.id)
        .eq('status', 'READY_FOR_PICKUP')
        .single();

      if (!resv || resv.member_id !== memberId) {
        throw new Error('此書已保留給其他預約讀者');
      }
      await supabase.from('reservations').update({ status: 'FULFILLED' }).eq('id', resv.id);
    } else if (copy.status !== 'AVAILABLE') {
      throw new Error(`館藏目前狀態為「${copy.status}」，無法借閱`);
    }

    // 計算借閱期限
    const loanDays = eligibility.member.tier?.loan_period_days ?? 14;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + loanDays);

    const isInterlibrary = currentBranchId && copy.branch_id !== currentBranchId;

    const { data: record, error: borrowErr } = await supabase
      .from('borrow_records')
      .insert({
        copy_id: copy.id,
        member_id: memberId,
        borrow_branch_id: currentBranchId || copy.branch_id,
        is_interlibrary: Boolean(isInterlibrary),
        due_date: dueDate.toISOString(),
        status: 'ACTIVE'
      })
      .select()
      .single();

    if (borrowErr) throw borrowErr;

    await supabase.from('book_copies').update({ status: 'BORROWED' }).eq('id', copy.id);

    return { record, bookTitle: copy.book?.title, dueDate, isInterlibrary };
  },

  // 2. 批次掃描借閱
  async batchBorrow({ barcodes, memberId, currentBranchId }) {
    const results = [];
    for (const barcode of barcodes) {
      try {
        const res = await this.borrowBook({ barcode, memberId, currentBranchId });
        results.push({ barcode, success: true, data: res });
      } catch (err) {
        results.push({ barcode, success: false, error: err.message });
      }
    }
    return results;
  },

  // 3. 歸還書籍（自動結算逾期罰款 + 自動觸發下一位預約通知）
  async returnBook({ barcode, returnBranchId, simulatedReturnDate = null }) {
    const { data: copy } = await supabase
      .from('book_copies')
      .select('*, book:books(*)')
      .eq('barcode', barcode)
      .single();

    if (!copy) throw new Error(`找不到條碼 ${barcode}`);

    const { data: borrow, error: borrowErr } = await supabase
      .from('borrow_records')
      .select('*')
      .eq('copy_id', copy.id)
      .in('status', ['ACTIVE', 'OVERDUE'])
      .order('borrowed_at', { ascending: false })
      .limit(1)
      .single();

    if (borrowErr || !borrow) throw new Error('此書目前無進行中的借閱紀錄');

    const returnTime = simulatedReturnDate ? new Date(simulatedReturnDate) : new Date();

    // 更新借閱紀錄
    await supabase
      .from('borrow_records')
      .update({
        returned_at: returnTime.toISOString(),
        return_branch_id: returnBranchId || copy.branch_id,
        status: 'RETURNED'
      })
      .eq('id', borrow.id);

    // 檢查並產生逾期罰款
    const fineResult = await fineService.evaluateAndCreateFine(borrow, returnTime);

    // 檢查是否有預約排隊，若有則自動指派此副本並通知第一位候補讀者
    const assignedReservation = await reservationService.assignReturnedCopyToNextInQueue(
      copy.book_id,
      copy.id
    );

    if (!assignedReservation) {
      // 判斷是否需跨館送回原館藏地
      const nextStatus = returnBranchId && returnBranchId !== copy.branch_id ? 'IN_TRANSIT' : 'AVAILABLE';
      await supabase.from('book_copies').update({ status: nextStatus }).eq('id', copy.id);
    }

    return {
      barcode,
      bookTitle: copy.book?.title,
      fine: fineResult,
      assignedReservation
    };
  },

  // 4. 批次歸還
  async batchReturn({ barcodes, returnBranchId }) {
    const results = [];
    for (const barcode of barcodes) {
      try {
        const res = await this.returnBook({ barcode, returnBranchId });
        results.push({ barcode, success: true, data: res });
      } catch (err) {
        results.push({ barcode, success: false, error: err.message });
      }
    }
    return results;
  },

  // 5. 續借（檢查續借次數上限、是否已逾期、是否有人預約）
  async renewBook(borrowId) {
    const { data: borrow, error } = await supabase
      .from('borrow_records')
      .select('*, copy:book_copies(*), member:profiles(*, tier:member_tiers(*))')
      .eq('id', borrowId)
      .single();

    if (error || !borrow || borrow.status !== 'ACTIVE') {
      throw new Error('僅能續借正常借閱中的書籍');
    }

    if (new Date(borrow.due_date) < new Date()) {
      throw new Error('書籍已逾期，無法續借，請先歸還');
    }

    const maxRenew = borrow.member?.tier?.max_renew_times ?? 1;
    if (borrow.renew_count >= maxRenew) {
      throw new Error(`已達最大續借次數 (${maxRenew} 次)`);
    }

    // 檢查是否有其他讀者正在預約此書
    const { count: waitingCount } = await supabase
      .from('reservations')
      .select('*', { count: 'exact', head: true })
      .eq('book_id', borrow.copy.book_id)
      .eq('status', 'WAITING');

    if (waitingCount > 0) {
      throw new Error('此書已有其他讀者預約排隊中，無法續借');
    }

    const extendDays = borrow.member?.tier?.loan_period_days ?? 14;
    const newDueDate = new Date(borrow.due_date);
    newDueDate.setDate(newDueDate.getDate() + extendDays);

    const { data: updated, error: updErr } = await supabase
      .from('borrow_records')
      .update({
        due_date: newDueDate.toISOString(),
        renew_count: borrow.renew_count + 1
      })
      .eq('id', borrowId)
      .select()
      .single();

    if (updErr) throw updErr;
    return updated;
  }
};
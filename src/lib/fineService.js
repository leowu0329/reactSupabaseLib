import { supabase } from './supabase.js';
import { memberService } from './memberService.js';

export const fineService = {
  // 1. 計算逾期天數與罰款金額（套用會員等級每日費率與罰款上限）
  async evaluateAndCreateFine(borrowRecord, returnDate = new Date()) {
    const due = new Date(borrowRecord.due_date);
    const returned = new Date(returnDate);
    const diffMs = returned.getTime() - due.getTime();
    const overdueDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (overdueDays <= 0) return null;

    const { data: member } = await supabase
      .from('profiles')
      .select('*, tier:member_tiers(*)')
      .eq('id', borrowRecord.member_id)
      .single();

    const dailyRate = Number(member?.tier?.daily_fine_rate ?? 5);
    const maxCap = Number(member?.tier?.max_fine_cap ?? 300);

    const rawFine = overdueDays * dailyRate;
    const finalFine = Math.min(rawFine, maxCap);

    // 寫入違規紀錄（逾期達 7 天以上加記違規點數並觸發停權評估）
    if (overdueDays >= 7) {
      await memberService.recordViolation(borrowRecord.member_id, {
        violationType: 'OVERDUE',
        points: 2,
        description: `嚴重逾期歸還 (${overdueDays} 天)`
      });
    }

    if (finalFine <= 0) return null;

    const { data: fine, error } = await supabase
      .from('fines')
      .insert({
        borrow_id: borrowRecord.id,
        member_id: borrowRecord.member_id,
        overdue_days: overdueDays,
        calculated_amount: finalFine,
        status: 'UNPAID'
      })
      .select()
      .single();

    if (error) throw error;
    return fine;
  },

  // 2. 繳納罰款
  async payFine(fineId, amount) {
    const { data: fine } = await supabase.from('fines').select('*').eq('id', fineId).single();
    if (!fine) throw new Error('找不到罰款紀錄');

    const newPaid = Number(fine.paid_amount) + Number(amount);
    const balance = Number(fine.calculated_amount) - Number(fine.waived_amount) - newPaid;
    const status = balance <= 0 ? 'PAID' : 'UNPAID';

    const { data, error } = await supabase
      .from('fines')
      .update({
        paid_amount: newPaid,
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', fineId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // 3. 罰款減免
  async waiveFine(fineId, waiveAmount, reason = '') {
    const { data: fine } = await supabase.from('fines').select('*').eq('id', fineId).single();
    if (!fine) throw new Error('找不到罰款紀錄');

    const newWaived = Number(fine.waived_amount) + Number(waiveAmount);
    const balance = Number(fine.calculated_amount) - newWaived - Number(fine.paid_amount);
    const status = balance <= 0 ? 'WAIVED' : 'UNPAID';

    const { data, error } = await supabase
      .from('fines')
      .update({
        waived_amount: newWaived,
        status,
        note: reason,
        updated_at: new Date().toISOString()
      })
      .eq('id', fineId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // 4. 罰款退款
  async refundFine(fineId, refundAmount, reason = '') {
    const { data: fine } = await supabase.from('fines').select('*').eq('id', fineId).single();
    if (!fine || Number(fine.paid_amount) < Number(refundAmount)) {
      throw new Error('退款金額不可大於已繳金額');
    }

    const { data, error } = await supabase
      .from('fines')
      .update({
        refunded_amount: Number(fine.refunded_amount) + Number(refundAmount),
        status: 'REFUNDED',
        note: reason,
        updated_at: new Date().toISOString()
      })
      .eq('id', fineId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};
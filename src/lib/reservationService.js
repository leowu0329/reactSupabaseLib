import { supabase } from './supabase.js';

export const reservationService = {
  // 1. 建立線上預約並自動計算候補順位
  async createReservation({ bookId, memberId, pickupBranchId }) {
    // 檢查是否重複預約
    const { data: existing } = await supabase
      .from('reservations')
      .select('id')
      .eq('book_id', bookId)
      .eq('member_id', memberId)
      .in('status', ['WAITING', 'READY_FOR_PICKUP'])
      .maybeSingle();

    if (existing) throw new Error('您已預約過此書，請勿重複預約');

    // 計算目前排隊人數
    const { count } = await supabase
      .from('reservations')
      .select('*', { count: 'exact', head: true })
      .eq('book_id', bookId)
      .eq('status', 'WAITING');

    const { data, error } = await supabase
      .from('reservations')
      .insert({
        book_id: bookId,
        member_id: memberId,
        pickup_branch_id: pickupBranchId,
        queue_position: (count || 0) + 1,
        status: 'WAITING'
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // 2. 歸還書籍時自動指派給候補第一位並發送到館通知（設定 3 天取書期限）
  async assignReturnedCopyToNextInQueue(bookId, copyId) {
    const { data: nextResv } = await supabase
      .from('reservations')
      .select('*, member:profiles(full_name, email)')
      .eq('book_id', bookId)
      .eq('status', 'WAITING')
      .order('queue_position', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!nextResv) return null;

    const pickupDeadline = new Date();
    pickupDeadline.setDate(pickupDeadline.getDate() + 3); // 3 日取書期限

    const { data: updated, error } = await supabase
      .from('reservations')
      .update({
        assigned_copy_id: copyId,
        status: 'READY_FOR_PICKUP',
        notified_at: new Date().toISOString(),
        pickup_deadline: pickupDeadline.toISOString()
      })
      .eq('id', nextResv.id)
      .select('*, member:profiles(full_name, email)')
      .single();

    if (error) throw error;

    await supabase.from('book_copies').update({ status: 'RESERVED' }).eq('id', copyId);

    // 遞補更新後方排隊序號
    await this.reorderQueue(bookId);

    return updated;
  },

  // 3. 取消預約並重排候補順序
  async cancelReservation(reservationId) {
    const { data: resv } = await supabase
      .from('reservations')
      .select('*')
      .eq('id', reservationId)
      .single();

    if (!resv) throw new Error('找不到預約紀錄');

    await supabase.from('reservations').update({ status: 'CANCELLED' }).eq('id', reservationId);

    // 若已保留實體書，釋放或轉給下一位
    if (resv.assigned_copy_id) {
      const next = await this.assignReturnedCopyToNextInQueue(resv.book_id, resv.assigned_copy_id);
      if (!next) {
        await supabase
          .from('book_copies')
          .update({ status: 'AVAILABLE' })
          .eq('id', resv.assigned_copy_id);
      }
    } else {
      await this.reorderQueue(resv.book_id);
    }
  },

  // 4. 掃描並自動取消逾期未取書的預約
  async expireOverduePickups() {
    const now = new Date().toISOString();
    const { data: expiredList } = await supabase
      .from('reservations')
      .select('*')
      .eq('status', 'READY_FOR_PICKUP')
      .lt('pickup_deadline', now);

    for (const item of expiredList || []) {
      await supabase.from('reservations').update({ status: 'EXPIRED' }).eq('id', item.id);
      if (item.assigned_copy_id) {
        const next = await this.assignReturnedCopyToNextInQueue(item.book_id, item.assigned_copy_id);
        if (!next) {
          await supabase
            .from('book_copies')
            .update({ status: 'AVAILABLE' })
            .eq('id', item.assigned_copy_id);
        }
      }
    }
    return expiredList?.length || 0;
  },

  async reorderQueue(bookId) {
    const { data: waitingList } = await supabase
      .from('reservations')
      .select('id')
      .eq('book_id', bookId)
      .eq('status', 'WAITING')
      .order('created_at', { ascending: true });

    for (let i = 0; i < (waitingList || []).length; i++) {
      await supabase
        .from('reservations')
        .update({ queue_position: i + 1 })
        .eq('id', waitingList[i].id);
    }
  }
};
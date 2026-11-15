import { supabase } from './supabase.js';

export const memberService = {
  // 1. 註冊讀者並自動產生讀者證號與綁定會員等級
  async registerMember({ fullName, email, readerCategory = 'PUBLIC', tierCode = 'PUBLIC' }) {
    const { data: tier, error: tierErr } = await supabase
      .from('member_tiers')
      .select('*')
      .eq('tier_code', tierCode)
      .single();

    if (tierErr) throw new Error('找不到指定的會員等級規則');

    const cardNumber = `CARD-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

    const { data, error } = await supabase
      .from('profiles')
      .insert({
        card_number: cardNumber,
        full_name: fullName,
        email,
        reader_category: readerCategory,
        tier_id: tier.id,
        status: 'ACTIVE'
      })
      .select('*, tier:member_tiers(*)')
      .single();

    if (error) throw error;
    return data;
  },

  // 2. 驗證讀者借閱資格（檢查停權、黑名單、未繳罰款與借閱上限）
  async checkBorrowEligibility(memberId) {
    const { data: member, error } = await supabase
      .from('profiles')
      .select('*, tier:member_tiers(*)')
      .eq('id', memberId)
      .single();

    if (error || !member) throw new Error('查無此讀者資料');

    // 自動解除已到期的停權狀態
    if (member.status === 'SUSPENDED' && member.suspended_until) {
      if (new Date(member.suspended_until) <= new Date()) {
        await supabase
          .from('profiles')
          .update({ status: 'ACTIVE', suspended_until: null })
          .eq('id', memberId);
        member.status = 'ACTIVE';
      }
    }

    if (member.status === 'BLACKLISTED') {
      return { eligible: false, reason: '讀者已列入黑名單，禁止借閱' };
    }
    if (member.status === 'SUSPENDED') {
      return {
        eligible: false,
        reason: `讀者停權中，解除時間：${new Date(member.suspended_until).toLocaleDateString()}`
      };
    }

    // 檢查目前借閱中數量
    const { count: activeBorrows } = await supabase
      .from('borrow_records')
      .select('*', { count: 'exact', head: true })
      .eq('member_id', memberId)
      .in('status', ['ACTIVE', 'OVERDUE']);

    const quota = member.tier?.max_borrow_quota ?? 5;
    if (activeBorrows >= quota) {
      return { eligible: false, reason: `已達借閱上限 (${activeBorrows}/${quota} 本)` };
    }

    // 檢查未繳罰款
    const { data: unpaidFines } = await supabase
      .from('fines')
      .select('calculated_amount, waived_amount, paid_amount')
      .eq('member_id', memberId)
      .eq('status', 'UNPAID');

    const totalUnpaid = (unpaidFines || []).reduce(
      (sum, f) => sum + (Number(f.calculated_amount) - Number(f.waived_amount) - Number(f.paid_amount)),
      0
    );

    if (totalUnpaid > 0) {
      return { eligible: false, reason: `尚有未繳罰款 NT$${totalUnpaid}，請先繳清` };
    }

    return {
      eligible: true,
      member,
      remainingQuota: quota - activeBorrows
    };
  },

  // 3. 紀錄違規並自動執行停權/黑名單規則（累積滿 3 點停權 14 天，滿 5 點列入黑名單）
  async recordViolation(memberId, { violationType, points = 1, description = '' }) {
    await supabase.from('member_violations').insert({
      member_id: memberId,
      violation_type: violationType,
      points,
      description
    });

    const { data: member } = await supabase
      .from('profiles')
      .select('violation_points')
      .eq('id', memberId)
      .single();

    const newPoints = (member?.violation_points || 0) + points;
    let updatePayload = { violation_points: newPoints };

    if (newPoints >= 5) {
      updatePayload.status = 'BLACKLISTED';
    } else if (newPoints >= 3) {
      const suspendDate = new Date();
      suspendDate.setDate(suspendDate.getDate() + 14);
      updatePayload.status = 'SUSPENDED';
      updatePayload.suspended_until = suspendDate.toISOString();
    }

    const { data: updated, error } = await supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', memberId)
      .select()
      .single();

    if (error) throw error;
    return updated;
  }
};
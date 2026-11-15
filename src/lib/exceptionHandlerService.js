import { supabase } from './supabase.js';
import {
  COPY_STATES,
  COPY_EVENTS,
  copyStateMachine,
  LibraryBusinessError,
} from '../config/copyStateMachine.js';

/**
 * 預約狀態常數（與資料庫 reservations_status_check 及 return_book_copy_safe RPC 完全對齊）
 */
const RESERVATION_STATUS = {
  WAITING: 'waiting',
  READY: 'ready_for_pickup',
};

/**
 * 解析 PostgreSQL / Supabase RPC 錯誤訊息並轉為標準 LibraryBusinessError
 */
function mapDatabaseError(error) {
  if (!error) return null;
  const msg = error.message || '';

  const knownCodes = [
    'MEMBER_NOT_FOUND',
    'MEMBER_SUSPENDED',
    'MEMBER_HAS_OVERDUE',
    'MEMBER_UNPAID_FINES',
    'BORROW_QUOTA_EXCEEDED',
    'COPY_NOT_FOUND',
    'COPY_ALREADY_BORROWED',
    'COPY_LOST',
    'COPY_UNAVAILABLE',
    'COPY_RESERVED_BY_OTHER',
    'STATE_MACHINE_VIOLATION',
    'SIMULATED_SYSTEM_CRASH',
    'INVALID_RETURN_STATE',
  ];

  for (const code of knownCodes) {
    if (msg.includes(code)) {
      const cleanMessage = msg.replace(`${code}: `, '');
      return new LibraryBusinessError(code, cleanMessage, { raw: msg });
    }
  }

  if (msg.includes('duplicate key') || error.code === '23505') {
    return new LibraryBusinessError('DUPLICATE_RECORD', '資料已存在，請勿重複建立', { raw: msg });
  }

  if (error.code === '23514') {
    return new LibraryBusinessError(
      'CHECK_CONSTRAINT_VIOLATION',
      `欄位值違反資料庫約束條件：${msg}`,
      { raw: msg }
    );
  }

  return new LibraryBusinessError('SYSTEM_ERROR', msg || '系統執行發生未預期錯誤', { raw: msg });
}

export const exceptionHandlerService = {
  /**
   * 1. 安全借閱（涵蓋：讀者停權、逾期限制、借閱上限、已被借出、已被預約、遺失/維修中阻擋）
   */
  async safeBorrowCopy({ userId, barcode, loanDays = 14, operatorId = null }) {
    // 前置快速狀態檢查（減少無效 RPC 呼叫）
    const { data: copy } = await supabase
      .from('book_copies')
      .select('id, status, barcode')
      .eq('barcode', barcode)
      .maybeSingle();

    if (!copy) {
      throw new LibraryBusinessError('COPY_NOT_FOUND', `找不到館藏條碼：${barcode}`);
    }

    // 狀態機前置校驗：是否允許執行 BORROW 事件
    copyStateMachine.transitionByEvent(copy.status, COPY_EVENTS.BORROW);

    // 呼叫後端具備悲觀鎖定 (FOR UPDATE) 與完整規則驗證的交易型 RPC
    const { data, error } = await supabase.rpc('borrow_book_copy_safe', {
      p_user_id: userId,
      p_barcode: barcode,
      p_loan_days: loanDays,
      p_operator_id: operatorId,
    });

    if (error) {
      throw mapDatabaseError(error);
    }

    return data;
  },

  /**
   * 2. 安全歸還（涵蓋：交易一致性 ACID Rollback、損壞轉維修、自動分配預約保留、發送通知並處理寄信失敗）
   */
  async safeReturnCopy({
    barcode,
    returnTime = null,
    isDamaged = false,
    damageNote = null,
    simulateCrash = false,
    operatorId = null,
    emailSender = null, // 可注入自訂或模擬失敗的寄信函數
  }) {
    const { data, error } = await supabase.rpc('return_book_copy_safe', {
      p_barcode: barcode,
      p_return_time: returnTime || new Date().toISOString(),
      p_is_damaged: isDamaged,
      p_damage_note: damageNote,
      p_simulate_crash: simulateCrash,
      p_operator_id: operatorId,
    });

    if (error) {
      throw mapDatabaseError(error);
    }

    // 若歸還後自動分配給下一位預約者，觸發到館 Email 通知（失敗時寫入重試佇列，不影響歸還主交易）
    let notificationResult = null;
    if (data?.assigned_reservation_id) {
      const { data: resv } = await supabase
        .from('reservations')
        .select('id, user_id, pickup_deadline, books(title)')
        .eq('id', data.assigned_reservation_id)
        .maybeSingle();

      const { data: userRow } = resv?.user_id
        ? await supabase.from('users').select('email').eq('id', resv.user_id).maybeSingle()
        : { data: null };

      if (userRow?.email) {
        notificationResult = await this.sendNotificationWithRetry({
          recipientEmail: userRow.email,
          notificationType: 'RESERVATION_READY',
          subject: `【圖書館到館通知】您預約的《${resv.books?.title || '館藏書籍'}》已保留`,
          payload: {
            reservation_id: resv.id,
            barcode,
            pickup_deadline: resv.pickup_deadline,
          },
          emailSender,
        });
      }
    }

    return {
      ...data,
      notificationResult,
    };
  },

  /**
   * 3. 館藏狀態機轉換（處理：書籍遺失、書籍損壞維修、修復上架、報廢除帳，並嚴格阻擋非法跳轉）
   */
  async transitionCopyState({ copyId, eventName, reason = '', operatorId = null }) {
    const { data: copy, error: fetchErr } = await supabase
      .from('book_copies')
      .select('id, barcode, status, condition_note')
      .eq('id', copyId)
      .single();

    if (fetchErr || !copy) {
      throw new LibraryBusinessError('COPY_NOT_FOUND', '找不到指定的館藏副本');
    }

    // 前端狀態機驗證目標狀態
    const nextState = copyStateMachine.transitionByEvent(copy.status, eventName);

    // 寫入資料庫（資料庫 Trigger 亦會再次把關）
    const { data: updatedCopy, error: updateErr } = await supabase
      .from('book_copies')
      .update({
        status: nextState,
        condition_note: reason || copy.condition_note,
      })
      .eq('id', copyId)
      .select()
      .single();

    if (updateErr) {
      throw mapDatabaseError(updateErr);
    }

    // 寫入狀態變遷稽核日誌
    await supabase.from('copy_state_logs').insert([
      {
        copy_id: copyId,
        from_status: copy.status,
        to_status: nextState,
        event_name: eventName,
        reason,
        operator_id: operatorId,
      },
    ]);

    return updatedCopy;
  },

  /**
   * 4. 安全建立預約（防止同一讀者重複預約同一本書）
   */
  async safeCreateReservation({ userId, bookId }) {
    // 檢查讀者是否已停權
    const { data: member } = await supabase
      .from('members')
      .select('id, status')
      .eq('user_id', userId)
      .maybeSingle();

    if (member && ['suspended', 'blacklisted'].includes(String(member.status).toLowerCase())) {
      throw new LibraryBusinessError('MEMBER_SUSPENDED', '讀者帳號已停權，無法建立預約');
    }

    // 檢查是否已有進行中的預約（waiting / ready_for_pickup）
    const { data: existing } = await supabase
      .from('reservations')
      .select('id, status')
      .eq('user_id', userId)
      .eq('book_id', bookId)
      .in('status', [RESERVATION_STATUS.WAITING, RESERVATION_STATUS.READY])
      .maybeSingle();

    if (existing) {
      throw new LibraryBusinessError(
        'DUPLICATE_RESERVATION',
        '您已預約過此書籍且尚在候補或保留中，禁止重複建立預約'
      );
    }

    const { count } = await supabase
      .from('reservations')
      .select('*', { count: 'exact', head: true })
      .eq('book_id', bookId)
      .eq('status', RESERVATION_STATUS.WAITING);

    const { data, error } = await supabase
      .from('reservations')
      .insert([
        {
          user_id: userId,
          book_id: bookId,
          queue_position: (count || 0) + 1,
          status: RESERVATION_STATUS.WAITING,
        },
      ])
      .select()
      .single();

    if (error) {
      throw mapDatabaseError(error);
    }

    return data;
  },

  /**
   * 5. Email 通知發送與失敗重試佇列（解決 Email 寄送失敗異常）
   */
  async sendNotificationWithRetry({
    recipientEmail,
    memberId = null,
    notificationType,
    subject,
    payload = {},
    emailSender = null,
  }) {
    const defaultSender = async () => ({ messageId: `mock-${Date.now()}` });
    const sender = typeof emailSender === 'function' ? emailSender : defaultSender;

    try {
      const res = await sender({ to: recipientEmail, subject, payload });
      return { sent: true, messageId: res?.messageId || 'sent' };
    } catch (err) {
      // Email 寄送失敗時，寫入 notification_retry_queue 保留重試紀錄
      const nextRetryAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 分鐘後重試
      const { data: retryRecord, error: insertErr } = await supabase
        .from('notification_retry_queue')
        .insert([
          {
            recipient_email: recipientEmail,
            member_id: memberId,
            notification_type: notificationType,
            subject,
            payload,
            status: 'PENDING',
            retry_count: 1,
            last_error: err.message || 'SMTP / Email API 連線逾時',
            next_retry_at: nextRetryAt,
          },
        ])
        .select()
        .single();

      if (insertErr) {
        throw new LibraryBusinessError('RETRY_QUEUE_WRITE_FAILED', insertErr.message);
      }

      return {
        sent: false,
        queuedForRetry: true,
        retryRecord,
        error: err.message,
      };
    }
  },

  /**
   * 6. 執行重試佇列中的待發送 Email 任務
   */
  async processNotificationRetryQueue(emailSender) {
    const { data: pendingList, error } = await supabase
      .from('notification_retry_queue')
      .select('*')
      .in('status', ['PENDING', 'RETRYING'])
      .order('created_at', { ascending: true })
      .limit(20);

    if (error) throw error;

    const results = [];
    for (const item of pendingList || []) {
      try {
        await emailSender({
          to: item.recipient_email,
          subject: item.subject,
          payload: item.payload,
        });

        const { data: updated } = await supabase
          .from('notification_retry_queue')
          .update({
            status: 'SENT',
            sent_at: new Date().toISOString(),
            last_error: null,
          })
          .eq('id', item.id)
          .select()
          .single();

        results.push({ id: item.id, status: 'SENT', record: updated });
      } catch (err) {
        const nextCount = item.retry_count + 1;
        const isExhausted = nextCount >= item.max_retries;
        const { data: updated } = await supabase
          .from('notification_retry_queue')
          .update({
            status: isExhausted ? 'FAILED_PERMANENT' : 'RETRYING',
            retry_count: nextCount,
            last_error: err.message,
            next_retry_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          })
          .eq('id', item.id)
          .select()
          .single();

        results.push({ id: item.id, status: updated.status, record: updated });
      }
    }

    return results;
  },
};
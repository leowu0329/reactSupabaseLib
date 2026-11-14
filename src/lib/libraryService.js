import { supabase } from './supabase.js';

export const libraryService = {
  // ==========================================
  // 1. 圖書與館藏副本管理 (Book & BookCopy 分離)
  // ==========================================
  
  /**
   * 新增書目資料並批次建立館藏副本與條碼
   */
  async createBookWithCopies(bookData, copiesData) {
    // 1. 建立書目 (Book)
    const { data: book, error: bookError } = await supabase
      .from('books')
      .insert([{
        isbn: bookData.isbn,
        title: bookData.title,
        author: bookData.author,
        publisher: bookData.publisher,
        category: bookData.category,
        tags: bookData.tags || [],
        cover_url: bookData.cover_url || null
      }])
      .select()
      .single();

    if (bookError) throw new Error(`建立書目失敗: ${bookError.message}`);

    // 2. 建立多筆館藏副本 (BookCopy)
    if (copiesData && copiesData.length > 0) {
      const copiesPayload = copiesData.map((copy, index) => ({
        book_id: book.id,
        barcode: copy.barcode || `${bookData.isbn}-${String(index + 1).padStart(3, '0')}`,
        location: copy.location || '總館-新書區',
        status: 'available'
      }));

      const { data: copies, error: copyError } = await supabase
        .from('book_copies')
        .insert(copiesPayload)
        .select();

      if (copyError) throw new Error(`建立館藏副本失敗: ${copyError.message}`);
      return { book, copies };
    }

    return { book, copies: [] };
  },

  /**
   * 查詢書目清單（含所有副本即時狀態統計）
   */
  async getBooksWithCopies() {
    const { data, error } = await supabase
      .from('books')
      .select(`
        *,
        book_copies (
          id,
          barcode,
          location,
          status
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data.map(book => ({
      ...book,
      total_copies: book.book_copies.length,
      available_copies: book.book_copies.filter(c => c.status === 'available').length
    }));
  },

  // ==========================================
  // 2. 借閱與歸還流程
  // ==========================================

  /**
   * 掃碼借書
   */
  async borrowCopy(userId, barcode, loanDays = 14) {
    const { data, error } = await supabase.rpc('borrow_book_copy', {
      p_user_id: userId,
      p_barcode: barcode,
      p_loan_days: loanDays
    });
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * 掃碼還書（自動算罰金 + 觸發第一順位預約通知）
   */
  async returnCopy(barcode, customReturnTime = null) {
    const params = { p_barcode: barcode };
    if (customReturnTime) params.p_return_time = customReturnTime;

    const { data, error } = await supabase.rpc('return_book_copy', params);
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * 查詢讀者個人借閱紀錄
   */
  async getUserBorrows(userId) {
    const { data, error } = await supabase
      .from('borrow_records')
      .select(`
        *,
        book_copies (
          barcode,
          location,
          books (title, author, isbn)
        )
      `)
      .eq('user_id', userId)
      .order('borrowed_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  // ==========================================
  // 3. 預約與候補流程
  // ==========================================

  /**
   * 讀者預約書籍
   */
  async reserveBook(userId, bookId) {
    const { data, error } = await supabase.rpc('create_reservation', {
      p_user_id: userId,
      p_book_id: bookId
    });
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * 取消預約（並自動將保留副本遞補給下一順位）
   */
  async cancelReservation(reservationId) {
    const { data: res, error: fetchErr } = await supabase
      .from('reservations')
      .select('*')
      .eq('id', reservationId)
      .single();

    if (fetchErr) throw fetchErr;

    const { error: updateErr } = await supabase
      .from('reservations')
      .update({ status: 'cancelled', assigned_copy_id: null })
      .eq('id', reservationId);

    if (updateErr) throw updateErr;

    // 若取消的是已分配副本的待取書狀態，透過逾期檢查邏輯觸發遞補
    if (res.status === 'ready_for_pickup' && res.assigned_copy_id) {
      const { data: nextRes } = await supabase
        .from('reservations')
        .select('*')
        .eq('book_id', res.book_id)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (nextRes) {
        const deadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
        await supabase
          .from('reservations')
          .update({
            status: 'ready_for_pickup',
            assigned_copy_id: res.assigned_copy_id,
            notified_at: new Date().toISOString(),
            pickup_deadline: deadline
          })
          .eq('id', nextRes.id);
      } else {
        await supabase
          .from('book_copies')
          .update({ status: 'available' })
          .eq('id', res.assigned_copy_id);
      }
    }
  },

  /**
   * 檢查逾期預約並自動遞補
   */
  async checkExpiredReservations(checkTime = null) {
    const params = checkTime ? { p_check_time: checkTime } : {};
    const { data, error } = await supabase.rpc('process_expired_reservations', params);
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * 標記館藏損壞並自動清理超額預約
   */
  async reportCopyDamaged(barcode) {
    const { data, error } = await supabase.rpc('mark_copy_damaged', {
      p_barcode: barcode
    });
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * 查詢讀者預約清單（含即時候補順位）
   */
  async getUserReservations(userId) {
    const { data, error } = await supabase
      .from('reservations')
      .select(`
        *,
        books (title, author, isbn)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }
};
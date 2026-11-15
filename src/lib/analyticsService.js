import { supabase } from './supabase.js';

export const analyticsService = {
  // 取得全部 12 項營運指標
  async getDashboardMetrics() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayIso = todayStart.toISOString();
    const nowIso = new Date().toISOString();

    const [
      { data: copies },
      { count: todayBorrows },
      { count: todayReturns },
      { count: overdueCount },
      { count: waitingReservations },
      { data: allBorrows }
    ] = await Promise.all([
      supabase.from('book_copies').select('id, status, book:books(id, title, category:categories(name))'),
      supabase.from('borrow_records').select('*', { count: 'exact', head: true }).gte('borrowed_at', todayIso),
      supabase.from('borrow_records').select('*', { count: 'exact', head: true }).gte('returned_at', todayIso),
      supabase
        .from('borrow_records')
        .select('*', { count: 'exact', head: true })
        .in('status', ['ACTIVE', 'OVERDUE'])
        .lt('due_date', nowIso),
      supabase
        .from('reservations')
        .select('*', { count: 'exact', head: true })
        .in('status', ['WAITING', 'READY_FOR_PICKUP']),
      supabase
        .from('borrow_records')
        .select(`
          id, borrowed_at,
          member:profiles(id, full_name, card_number),
          copy:book_copies(book:books(id, title, category:categories(name)))
        `)
    ]);

    const validCopies = (copies || []).filter((c) => !['LOST', 'DISCARDED'].includes(c.status));
    const totalBooks = validCopies.length;
    const availableBooks = validCopies.filter((c) => c.status === 'AVAILABLE').length;
    const borrowedBooks = validCopies.filter((c) => c.status === 'BORROWED').length;

    // 12. 館藏使用率 (%)
    const utilizationRate = totalBooks > 0 ? Number(((borrowedBooks / totalBooks) * 100).toFixed(2)) : 0;

    // 8. 熱門書籍排行榜 & 9. 熱門分類分析 & 10. 讀者借閱排行 & 11. 每月借閱趨勢
    const bookFreq = {};
    const categoryFreq = {};
    const readerFreq = {};
    const monthlyTrend = {};

    for (const r of allBorrows || []) {
      const title = r.copy?.book?.title || '未知書籍';
      const cat = r.copy?.book?.category?.name || '未分類';
      const reader = r.member ? `${r.member.full_name} (${r.member.card_number})` : '未知讀者';
      const month = r.borrowed_at ? r.borrowed_at.slice(0, 7) : 'Unknown';

      bookFreq[title] = (bookFreq[title] || 0) + 1;
      categoryFreq[cat] = (categoryFreq[cat] || 0) + 1;
      readerFreq[reader] = (readerFreq[reader] || 0) + 1;
      monthlyTrend[month] = (monthlyTrend[month] || 0) + 1;
    }

    const toSortedTop = (mapObj, limit = 5) =>
      Object.entries(mapObj)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);

    return {
      totalBooks,               // 1. 圖書總數
      availableBooks,           // 2. 可借閱數量
      borrowedBooks,            // 3. 借出數量
      todayBorrows: todayBorrows || 0, // 4. 今日借閱量
      todayReturns: todayReturns || 0, // 5. 今日歸還量
      overdueCount: overdueCount || 0, // 6. 逾期未還數量
      waitingReservations: waitingReservations || 0, // 7. 預約等待數量
      topBooks: toSortedTop(bookFreq, 5),         // 8. 熱門書籍排行榜
      topCategories: toSortedTop(categoryFreq, 5),// 9. 熱門分類分析
      topReaders: toSortedTop(readerFreq, 5),     // 10. 讀者借閱排行
      monthlyTrend: Object.entries(monthlyTrend)  // 11. 每月借閱趨勢
        .map(([month, count]) => ({ month, count }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      utilizationRate           // 12. 館藏使用率
    };
  }
};
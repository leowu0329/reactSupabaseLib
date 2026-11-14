import { supabase } from './supabase.js';

export const realtimeService = {
  /**
   * 訂閱館藏副本 (book_copies) 狀態異動，即時更新前端庫存與推播通知
   * @param {Function} onCopyChange - 當副本狀態改變時的回呼函數
   * @returns {Object} Supabase RealtimeChannel 實例
   */
  subscribeCopyStatus(onCopyChange) {
    const channel = supabase
      .channel('public:book_copies_changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'book_copies' },
        (payload) => {
          if (typeof onCopyChange === 'function') {
            onCopyChange(payload.new, payload.old);
          }
        }
      )
      .subscribe();

    return channel;
  },

  /**
   * 解除訂閱並釋放 WebSocket 連線
   */
  async unsubscribe(channel) {
    if (channel) {
      await supabase.removeChannel(channel);
    }
  },
};
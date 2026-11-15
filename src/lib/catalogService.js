import { supabase } from './supabase.js';

export const catalogService = {
  // 1. 書籍與副本整合查詢
  async searchBooks({ keyword = '', categoryId = null, status = null } = {}) {
    let query = supabase
      .from('books')
      .select(`
        *,
        author:authors(id, name),
        publisher:publishers(id, name),
        category:categories(id, code, name),
        copies:book_copies(id, barcode, shelf_location, status, branch:branches(id, branch_name))
      `)
      .order('created_at', { ascending: false });

    if (keyword) {
      query = query.or(`title.ilike.%${keyword}%,isbn.ilike.%${keyword}%`);
    }
    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    const { data, error } = await query;
    if (error) throw error;

    if (status) {
      return data.filter((b) => b.copies?.some((c) => c.status === status));
    }
    return data;
  },

  // 2. ISBN 外部書目查詢與自動匯入（支援 OpenLibrary API 與本地標準化轉換）
  async fetchAndImportByISBN(isbn, { branchId, shelfLocation, copyCount = 1 }) {
    const cleanIsbn = isbn.replace(/[-\s]/g, '');
    let bookMeta = null;

    try {
      const res = await fetch(
        `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`
      );
      const json = await res.json();
      const record = json[`ISBN:${cleanIsbn}`];
      if (record) {
        bookMeta = {
          isbn: cleanIsbn,
          title: record.title || `未命名書目 (${cleanIsbn})`,
          authorName: record.authors?.[0]?.name || '未知作者',
          publisherName: record.publishers?.[0]?.name || '未知出版社',
          publishYear: parseInt(record.publish_date, 10) || new Date().getFullYear(),
          coverUrl: record.cover?.large || record.cover?.medium || '',
          summary: record.notes || ''
        };
      }
    } catch {
      // 離線或外部 API 無回應時使用標準備援結構
    }

    if (!bookMeta) {
      bookMeta = {
        isbn: cleanIsbn,
        title: `ISBN 匯入書籍 - ${cleanIsbn}`,
        authorName: '標準匯入作者',
        publisherName: '標準出版社',
        publishYear: new Date().getFullYear(),
        coverUrl: '',
        summary: '透過 ISBN 快速建檔'
      };
    }

    // 寫入關聯主檔並建立書目與多本副本
    const { data: author } = await supabase
      .from('authors')
      .upsert({ name: bookMeta.authorName }, { onConflict: 'name' })
      .select()
      .single();

    const { data: publisher } = await supabase
      .from('publishers')
      .upsert({ name: bookMeta.publisherName }, { onConflict: 'name' })
      .select()
      .single();

    const { data: book, error: bookErr } = await supabase
      .from('books')
      .upsert(
        {
          isbn: bookMeta.isbn,
          title: bookMeta.title,
          author_id: author?.id,
          publisher_id: publisher?.id,
          publish_year: bookMeta.publishYear,
          cover_url: bookMeta.coverUrl,
          summary: bookMeta.summary
        },
        { onConflict: 'isbn' }
      )
      .select()
      .single();

    if (bookErr) throw bookErr;

    const copies = await this.addBookCopies(book.id, { branchId, shelfLocation, count: copyCount });
    return { book, copies };
  },

  // 3. 批次新增多本館藏副本並自動產生唯一條碼
  async addBookCopies(bookId, { branchId, shelfLocation, count = 1 }) {
    const timestamp = Date.now().toString().slice(-6);
    const copiesPayload = Array.from({ length: count }).map((_, idx) => ({
      book_id: bookId,
      barcode: `LIB-${timestamp}-${String(idx + 1).padStart(3, '0')}`,
      branch_id: branchId,
      shelf_location: shelfLocation,
      status: 'AVAILABLE'
    }));

    const { data, error } = await supabase.from('book_copies').insert(copiesPayload).select();
    if (error) throw error;
    return data;
  },

  // 4. 遺失、損壞、報廢狀態管理
  async updateCopyCondition(copyId, status, conditionNote = '') {
    const validStatuses = ['AVAILABLE', 'LOST', 'DAMAGED', 'DISCARDED'];
    if (!validStatuses.includes(status)) {
      throw new Error(`無效的館藏狀態: ${status}`);
    }

    const { data, error } = await supabase
      .from('book_copies')
      .update({
        status,
        condition_note: conditionNote,
        updated_at: new Date().toISOString()
      })
      .eq('id', copyId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};
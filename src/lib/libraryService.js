import { supabase } from './supabase.js';

export const libraryService = {
  // ==========================================================================
  // 1. 基礎主檔與讀者資料管理 (Branches, Shelves, Publishers, Categories, Members)
  // ==========================================================================

  async ensureDefaultBranchAndShelf() {
    let { data: branch } = await supabase
      .from('branches')
      .select('*')
      .eq('code', 'MAIN')
      .maybeSingle();

    if (!branch) {
      const { data: createdBranch, error: bErr } = await supabase
        .from('branches')
        .insert([{ code: 'MAIN', name: '總館', address: '台南市東區' }])
        .select()
        .single();
      if (bErr) throw new Error(`建立預設分館失敗: ${bErr.message}`);
      branch = createdBranch;
    }

    let { data: shelf } = await supabase
      .from('shelves')
      .select('*')
      .eq('branch_id', branch.id)
      .eq('shelf_code', 'A1-01')
      .maybeSingle();

    if (!shelf) {
      const { data: createdShelf, error: sErr } = await supabase
        .from('shelves')
        .insert([{ branch_id: branch.id, floor: '1F', zone: '新書展示區', shelf_code: 'A1-01' }])
        .select()
        .single();
      if (sErr) throw new Error(`建立預設書架失敗: ${sErr.message}`);
      shelf = createdShelf;
    }

    return { branch, shelf };
  },

  async ensureMemberProfile(userId, email, fullName = '圖書館讀者') {
    await supabase
      .from('users')
      .upsert([{ id: userId, email }], { onConflict: 'id' });

    await supabase
      .from('profiles')
      .upsert([{ id: userId, full_name: fullName, role: 'member' }], { onConflict: 'id' });

    let { data: member } = await supabase
      .from('members')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!member) {
      const memberCode = `LIB-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
      const { data: createdMember, error } = await supabase
        .from('members')
        .insert([{
          user_id: userId,
          member_code: memberCode,
          member_type: 'general',
          max_borrow_quota: 5,
          status: 'active',
        }])
        .select()
        .single();

      if (error) throw new Error(`建立讀者主檔失敗: ${error.message}`);
      member = createdMember;
    }

    return member;
  },

  // ==========================================================================
  // 2. 正規化書目與館藏副本分離管理 (Books + Authors/Publishers/Categories + BookCopies)
  // ==========================================================================

  async upsertNormalizedMetadata({ authorName, publisherName, categoryCode, categoryName }) {
    // 出版社
    const { data: publisher, error: pubErr } = await supabase
      .from('publishers')
      .upsert([{ name: publisherName || '未標示出版社' }], { onConflict: 'name' })
      .select()
      .single();
    if (pubErr) throw new Error(`出版社處理失敗: ${pubErr.message}`);

    // 分類
    const code = categoryCode || '000';
    const { data: category, error: catErr } = await supabase
      .from('categories')
      .upsert([{ code, name: categoryName || '一般綜合類' }], { onConflict: 'code' })
      .select()
      .single();
    if (catErr) throw new Error(`分類處理失敗: ${catErr.message}`);

    // 作者
    let { data: author } = await supabase
      .from('authors')
      .select('*')
      .eq('name', authorName)
      .maybeSingle();

    if (!author) {
      const { data: newAuthor, error: authErr } = await supabase
        .from('authors')
        .insert([{ name: authorName }])
        .select()
        .single();
      if (authErr) throw new Error(`作者處理失敗: ${authErr.message}`);
      author = newAuthor;
    }

    return { publisher, category, author };
  },

  async createNormalizedBookWithCopies(bookInput, copiesInput = []) {
    const { branch, shelf } = await this.ensureDefaultBranchAndShelf();
    const { publisher, category, author } = await this.upsertNormalizedMetadata({
      authorName: bookInput.author,
      publisherName: bookInput.publisher,
      categoryCode: bookInput.categoryCode || '800',
      categoryName: bookInput.category || '資訊與文學',
    });

    // 1. 建立書目主檔 (books)
    const { data: book, error: bookErr } = await supabase
      .from('books')
      .insert([{
        isbn: bookInput.isbn,
        title: bookInput.title,
        subtitle: bookInput.subtitle || null,
        publisher_id: publisher.id,
        category_id: category.id,
        publish_year: bookInput.publish_year || new Date().getFullYear(),
        cover_url: bookInput.cover_url || null,
        summary: bookInput.summary || null,
      }])
      .select()
      .single();

    if (bookErr) throw new Error(`建立正規化書目失敗: ${bookErr.message}`);

    // 2. 建立書籍與作者多對多關聯 (book_authors)
    const { error: baErr } = await supabase
      .from('book_authors')
      .insert([{
        book_id: book.id,
        author_id: author.id,
        author_order: 1,
        role: 'author',
      }]);
    if (baErr) throw new Error(`建立書籍作者關聯失敗: ${baErr.message}`);

    // 3. 建立採購紀錄 (acquisitions)
    const qty = Math.max(1, copiesInput.length);
    const { data: acquisition } = await supabase
      .from('acquisitions')
      .insert([{
        book_id: book.id,
        supplier_name: bookInput.supplier || '預設圖書供應商',
        quantity: qty,
        unit_price: bookInput.unitPrice || 450,
        status: 'cataloged',
      }])
      .select()
      .single();

    // 4. 建立實體館藏副本 (book_copies)
    const copiesPayload = copiesInput.map((c, idx) => ({
      book_id: book.id,
      barcode: c.barcode || `${bookInput.isbn}-C${String(idx + 1).padStart(3, '0')}`,
      branch_id: c.branch_id || branch.id,
      shelf_id: c.shelf_id || shelf.id,
      acquisition_id: acquisition?.id || null,
      status: 'available',
    }));

    const { data: copies, error: copyErr } = await supabase
      .from('book_copies')
      .insert(copiesPayload)
      .select();

    if (copyErr) throw new Error(`建立實體館藏副本失敗: ${copyErr.message}`);

    return { book, author, publisher, category, copies };
  },

  async getBooksWithCopies() {
    const { data, error } = await supabase
      .from('books')
      .select(`
        *,
        publishers (id, name),
        categories (id, code, name),
        book_authors (
          role,
          authors (id, name)
        ),
        book_copies (
          id,
          barcode,
          status,
          branches (id, name),
          shelves (id, floor, zone, shelf_code)
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`查詢書目清單失敗: ${error.message}`);

    return data.map((book) => ({
      ...book,
      author_names: (book.book_authors || []).map((ba) => ba.authors?.name).filter(Boolean).join(', '),
      publisher_name: book.publishers?.name || '未標示',
      category_name: book.categories?.name || '未分類',
      total_copies: (book.book_copies || []).length,
      available_copies: (book.book_copies || []).filter((c) => c.status === 'available').length,
    }));
  },

  // ==========================================================================
  // 3. 交易型借閱與歸還流程 (透過 RPC 執行悲觀鎖定 FOR UPDATE，杜絕重複借出)
  // ==========================================================================

  async borrowCopy(userId, barcode, loanDays = 14, operatorId = null) {
    const { data, error } = await supabase.rpc('borrow_book_copy_v2', {
      p_user_id: userId,
      p_barcode: barcode,
      p_loan_days: loanDays,
      p_operator_id: operatorId,
    });
    if (error) throw new Error(error.message);
    return data;
  },

  async returnCopy(barcode, customReturnTime = null, operatorId = null) {
    const params = { p_barcode: barcode, p_operator_id: operatorId };
    if (customReturnTime) params.p_return_time = customReturnTime;

    const { data, error } = await supabase.rpc('return_book_copy_v2', params);
    if (error) throw new Error(error.message);
    return data;
  },

  async getMemberLoanHistory(memberId) {
    const { data, error } = await supabase
      .from('loans')
      .select(`
        *,
        branches (name),
        loan_items (
          id,
          due_date,
          returned_at,
          status,
          book_copies (
            barcode,
            status,
            books (title, isbn)
          ),
          fines (
            id,
            fine_type,
            overdue_days,
            amount,
            status,
            payments (
              id,
              receipt_no,
              transaction_type,
              amount,
              payment_method,
              created_at
            )
          )
        )
      `)
      .eq('member_id', memberId)
      .order('borrowed_at', { ascending: false });

    if (error) throw new Error(`查詢借閱歷史失敗: ${error.message}`);
    return data;
  },

  // ==========================================================================
  // 4. 獨立帳務交易操作 (罰款產生、繳費、折抵、退款)
  // ==========================================================================

  async payOrAdjustFine(fineId, transactionType, amount, paymentMethod = 'cash', operatorId = null, note = '') {
    const { data, error } = await supabase.rpc('record_fine_transaction', {
      p_fine_id: fineId,
      p_transaction_type: transactionType,
      p_amount: amount,
      p_payment_method: paymentMethod,
      p_operator_id: operatorId,
      p_note: note,
    });
    if (error) throw new Error(error.message);
    return data;
  },
};
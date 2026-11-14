import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import AppModal from '../components/AppModal';

export default function Home({ user }) {
  const [books, setBooks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ show: false, title: '', message: '', type: 'info', onConfirm: null });

  const fetchBooks = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('books')
      .select(`
        *,
        book_copies (id, barcode, status)
      `)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setBooks(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchBooks();
  }, []);

  const handleBorrowClick = (book) => {
    if (!user) {
      setModal({
        show: true,
        title: '請先登入',
        message: '您需要登入會員帳號才能借閱書籍。',
        type: 'warning',
      });
      return;
    }

    const availableCopy = book.book_copies.find((c) => c.status === 'available');
    if (!availableCopy) return;

    setModal({
      show: true,
      title: '確認借閱',
      message: `確定要借閱《${book.title}》（館藏條碼：${availableCopy.barcode}）嗎？借期為 14 天。`,
      type: 'info',
      onConfirm: () => executeBorrow(availableCopy.id, book.title),
    });
  };

  const executeBorrow = async (copyId, bookTitle) => {
    try {
      // 1. 建立借閱紀錄
      const { error: borrowError } = await supabase.from('borrow_records').insert({
        user_id: user.id,
        copy_id: copyId,
      });
      if (borrowError) throw borrowError;

      // 2. 更新副本狀態為 borrowed
      const { error: copyError } = await supabase
        .from('book_copies')
        .update({ status: 'borrowed' })
        .eq('id', copyId);
      if (copyError) throw copyError;

      await fetchBooks();
      setModal({
        show: true,
        title: '借閱成功',
        message: `您已成功借閱《${bookTitle}》，請至「我的借閱」查看歸還期限。`,
        type: 'success',
      });
    } catch (err) {
      setModal({
        show: true,
        title: '借閱失敗',
        message: err.message,
        type: 'danger',
      });
    }
  };

  const filteredBooks = books.filter(
    (b) =>
      b.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.author.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.isbn.includes(searchTerm)
  );

  return (
    <div className="container pb-5">
      <div className="row mb-4 align-items-center">
        <div className="col-md-6">
          <h2 className="fw-bold mb-0">
            <i className="fa-solid fa-books me-2 text-primary"></i>館藏目錄
          </h2>
        </div>
        <div className="col-md-6 mt-3 mt-md-0">
          <div className="input-group">
            <span className="input-group-text bg-white">
              <i className="fa-solid fa-search text-muted"></i>
            </span>
            <input
              type="text"
              className="form-control"
              placeholder="搜尋書名、作者或 ISBN..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status"></div>
        </div>
      ) : (
        <div className="row g-4">
          {filteredBooks.map((book) => {
            const availableCount = book.book_copies.filter((c) => c.status === 'available').length;
            const totalCount = book.book_copies.length;

            return (
              <div className="col-sm-6 col-md-4 col-lg-3" key={book.id}>
                <div className="card h-100 shadow-sm border-0">
                  <img
                    src={book.cover_url || 'https://placehold.co/300x420?text=No+Cover'}
                    className="card-img-top object-fit-cover"
                    alt={book.title}
                    style={{ height: '260px' }}
                  />
                  <div className="card-body d-flex flex-column">
                    <span className="badge bg-secondary align-self-start mb-2">{book.category}</span>
                    <h5 className="card-title fw-bold text-truncate" title={book.title}>
                      {book.title}
                    </h5>
                    <p className="card-text text-muted small mb-1">
                      <i className="fa-solid fa-pen-nib me-1"></i> {book.author}
                    </p>
                    <p className="card-text text-muted small mb-3">
                      <i className="fa-solid fa-barcode me-1"></i> {book.isbn}
                    </p>
                    <div className="mt-auto pt-2 border-top d-flex justify-content-between align-items-center">
                      <span className={`small fw-bold ${availableCount > 0 ? 'text-success' : 'text-danger'}`}>
                        可借閱：{availableCount} / {totalCount}
                      </span>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={availableCount === 0}
                        onClick={() => handleBorrowClick(book)}
                      >
                        {availableCount > 0 ? (
                          <>
                            <i className="fa-solid fa-hand-holding-heart me-1"></i> 借閱
                          </>
                        ) : (
                          '已全數借出'
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AppModal
        {...modal}
        onClose={() => setModal({ ...modal, show: false })}
      />
    </div>
  );
}
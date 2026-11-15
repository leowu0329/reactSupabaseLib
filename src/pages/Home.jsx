import React, { useEffect, useState } from 'react';
import { useLibraryStore } from '../store/useLibraryStore';
import { libraryService } from '../lib/libraryService';
import { exceptionHandlerService } from '../lib/exceptionHandlerService';
import { COPY_STATES } from '../config/copyStateMachine';
import CopyStateBadge from '../components/CopyStateBadge';
import AppModal from '../components/AppModal';

export default function Home({ user }) {
  const books = useLibraryStore((state) => state.books);
  const loading = useLibraryStore((state) => state.booksLoading);
  const fetchBooks = useLibraryStore((state) => state.fetchBooks);
  const pushNotification = useLibraryStore((state) => state.pushNotification);

  const [searchTerm, setSearchTerm] = useState('');
  const [modal, setModal] = useState({ show: false, title: '', message: '', type: 'info', onConfirm: null });

  useEffect(() => {
    fetchBooks().catch((err) => {
      setModal({ show: true, title: '載入失敗', message: err.message, type: 'danger' });
    });
  }, [fetchBooks]);

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

    const availableCopy = (book.book_copies || []).find((c) => c.status === COPY_STATES.AVAILABLE);
    if (!availableCopy) return;

    setModal({
      show: true,
      title: '確認借閱',
      message: `確定要借閱《${book.title}》（館藏條碼：${availableCopy.barcode}）嗎？借期為 14 天。`,
      type: 'info',
      onConfirm: () => executeBorrow(availableCopy.barcode, book.title),
    });
  };

  const executeBorrow = async (barcode, bookTitle) => {
    try {
      await libraryService.ensureMemberProfile(user.id, user.email);
      const res = await exceptionHandlerService.safeBorrowCopy({
        userId: user.id,
        barcode,
        loanDays: 14,
        operatorId: user.id,
      });
      await fetchBooks();

      pushNotification({
        title: '借閱成功',
        message: `已借閱《${bookTitle}》（條碼：${barcode}）`,
      });

      setModal({
        show: true,
        title: '借閱成功',
        message: `您已成功借閱《${bookTitle}》，應還日期：${new Date(res.due_date).toLocaleDateString()}。`,
        type: 'success',
      });
    } catch (err) {
      setModal({
        show: true,
        title: `借閱受阻 (${err.code || 'ERROR'})`,
        message: err.message,
        type: 'danger',
      });
    }
  };

  const handleReserveClick = async (book) => {
    if (!user) {
      setModal({
        show: true,
        title: '請先登入',
        message: '您需要登入會員帳號才能預約書籍。',
        type: 'warning',
      });
      return;
    }

    try {
      await libraryService.ensureMemberProfile(user.id, user.email);
      const resv = await exceptionHandlerService.safeCreateReservation({
        userId: user.id,
        bookId: book.id,
      });
      setModal({
        show: true,
        title: '預約成功',
        message: `已為您建立《${book.title}》預約候補，目前候補順位：第 ${resv.queue_position} 順位。`,
        type: 'success',
      });
    } catch (err) {
      setModal({
        show: true,
        title: `預約失敗 (${err.code || 'ERROR'})`,
        message: err.message,
        type: 'danger',
      });
    }
  };

  const filteredBooks = books.filter((b) => {
    const kw = searchTerm.toLowerCase();
    return (
      (b.title || '').toLowerCase().includes(kw) ||
      (b.author_names || '').toLowerCase().includes(kw) ||
      (b.isbn || '').includes(searchTerm)
    );
  });

  return (
    <div className="container pb-5">
      <div className="row mb-4 align-items-center">
        <div className="col-md-6">
          <h2 className="fw-bold mb-0">
            <i className="fa-solid fa-book me-2 text-primary"></i>館藏目錄
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
            const availableCount = book.available_copies ?? 0;
            const totalCount = book.total_copies ?? 0;
            const firstCopy = (book.book_copies || [])[0];

            return (
              <div className="col-sm-6 col-md-4 col-lg-3" key={book.id}>
                <div className="card h-100 shadow-sm border-0">
                  <img
                    src={book.cover_url || 'https://placehold.co/300x420?text=No+Cover'}
                    className="card-img-top object-fit-cover"
                    alt={book.title}
                    style={{ height: '240px' }}
                  />
                  <div className="card-body d-flex flex-column">
                    <h6 className="card-title fw-bold text-truncate" title={book.title}>
                      {book.title}
                    </h6>
                    <p className="text-muted small mb-2">{book.author_names || '未知作者'}</p>
                    <div className="mb-2">
                      {firstCopy && <CopyStateBadge status={firstCopy.status} />}
                    </div>
                    <div className="mt-auto">
                      <div className="small text-secondary mb-2">
                        可借副本：{availableCount} / {totalCount} 本
                      </div>
                      {availableCount > 0 ? (
                        <button
                          className="btn btn-primary btn-sm w-100"
                          onClick={() => handleBorrowClick(book)}
                        >
                          立即借閱
                        </button>
                      ) : (
                        <button
                          className="btn btn-outline-warning btn-sm w-100"
                          onClick={() => handleReserveClick(book)}
                        >
                          預約候補
                        </button>
                      )}
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
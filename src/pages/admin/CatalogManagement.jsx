import React, { useState, useEffect } from 'react';
import DataTable from '../../components/DataTable';
import CopyStateBadge from '../../components/CopyStateBadge';
import { fetchBooks, createBook, deleteBook } from '../../lib/catalogService';
import { useUiStore } from '../../store/useUiStore';

export default function CatalogManagement({ activeTab = 'books' }) {
  const [books, setBooks] = useState([]);
  const [formData, setFormData] = useState({ title: '', isbn: '', author: '', category: '' });
  const [formErrors, setFormErrors] = useState({});
  const { showToast, openConfirm } = useUiStore();

  const loadData = async () => {
    try {
      const list = await fetchBooks();
      setBooks(list || []);
    } catch {
      setBooks([]);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const validateBookForm = () => {
    const errs = {};
    if (!formData.title.trim()) errs.title = '書名為必填欄位';
    if (!formData.isbn.trim() || !/^(97(8|9))?\d{9}(\d|X)$/i.test(formData.isbn.replace(/-/g, ''))) {
      errs.isbn = '請輸入有效的 10 碼或 13 碼 ISBN';
    }
    if (!formData.author.trim()) errs.author = '作者為必填欄位';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!validateBookForm()) {
      showToast('表單欄位驗證未通過，請檢查錯誤提示', 'warning');
      return;
    }
    try {
      const created = await createBook(formData);
      setBooks((prev) => [created || { id: Date.now(), ...formData, status: 'available' }, ...prev]);
      setFormData({ title: '', isbn: '', author: '', category: '' });
      showToast(`已成功新增圖書《${formData.title}》`, 'success');
    } catch (err) {
      showToast(err.message || '新增圖書失敗', 'danger');
    }
  };

  const handleDeleteRequest = (book) => {
    openConfirm({
      title: '確認刪除館藏書目',
      message: `您確定要刪除《${book.title}》（ISBN: ${book.isbn}）嗎？此操作無法復原。`,
      confirmText: '確認刪除',
      variant: 'danger',
      onConfirm: async () => {
        await deleteBook(book.id);
        setBooks((prev) => prev.filter((item) => item.id !== book.id));
        showToast(`已刪除圖書《${book.title}》`, 'success');
      },
    });
  };

  const columns = [
    { key: 'isbn', label: 'ISBN' },
    { key: 'title', label: '書名' },
    { key: 'author', label: '作者' },
    { key: 'category', label: '分類' },
    {
      key: 'status',
      label: '館藏狀態',
      render: (val) => <CopyStateBadge status={val || 'available'} />,
    },
  ];

  return (
    <div>
      <h4 className="fw-bold mb-3">圖書管理模組</h4>

      {activeTab === 'book-create' && (
        <div className="card shadow-sm border-0 mb-4">
          <div className="card-header bg-white fw-semibold">新增圖書書目</div>
          <div className="card-body">
            <form onSubmit={handleCreateSubmit} noValidate>
              <div className="row g-3">
                <div className="col-md-6">
                  <label htmlFor="bookTitle" className="form-label">書名 *</label>
                  <input
                    id="bookTitle"
                    type="text"
                    className={`form-control ${formErrors.title ? 'is-invalid' : ''}`}
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                  {formErrors.title && <div className="invalid-feedback">{formErrors.title}</div>}
                </div>
                <div className="col-md-6">
                  <label htmlFor="bookIsbn" className="form-label">ISBN *</label>
                  <input
                    id="bookIsbn"
                    type="text"
                    className={`form-control ${formErrors.isbn ? 'is-invalid' : ''}`}
                    value={formData.isbn}
                    onChange={(e) => setFormData({ ...formData, isbn: e.target.value })}
                  />
                  {formErrors.isbn && <div className="invalid-feedback">{formErrors.isbn}</div>}
                </div>
                <div className="col-md-6">
                  <label htmlFor="bookAuthor" className="form-label">作者 *</label>
                  <input
                    id="bookAuthor"
                    type="text"
                    className={`form-control ${formErrors.author ? 'is-invalid' : ''}`}
                    value={formData.author}
                    onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                  />
                  {formErrors.author && <div className="invalid-feedback">{formErrors.author}</div>}
                </div>
                <div className="col-md-6">
                  <label htmlFor="bookCategory" className="form-label">分類號</label>
                  <input
                    id="bookCategory"
                    type="text"
                    className="form-control"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  />
                </div>
              </div>
              <div className="mt-3">
                <button type="submit" className="btn btn-primary">儲存圖書</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        data={books}
        searchPlaceholder="搜尋書名、ISBN、作者..."
        renderRowActions={(row) => (
          <button
            type="button"
            className="btn btn-sm btn-outline-danger"
            onClick={() => handleDeleteRequest(row)}
          >
            刪除
          </button>
        )}
      />
    </div>
  );
}
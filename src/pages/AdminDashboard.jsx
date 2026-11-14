import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { uploadCoverToCloudinary } from '../lib/cloudinary';
import AppModal from '../components/AppModal';

export default function AdminDashboard() {
  const [books, setBooks] = useState([]);
  const [form, setForm] = useState({ title: '', author: '', isbn: '', category: '資訊科技', copyCount: 1 });
  const [coverFile, setCoverFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState({ show: false, title: '', message: '', type: 'info' });

  const fetchAllBooks = async () => {
    const { data } = await supabase
      .from('books')
      .select('*, book_copies(id, barcode, status)')
      .order('created_at', { ascending: false });
    if (data) setBooks(data);
  };

  useEffect(() => {
    fetchAllBooks();
  }, []);

  const handleCreateBook = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      let coverUrl = '';
      if (coverFile) {
        coverUrl = await uploadCoverToCloudinary(coverFile);
      }

      // 1. 新增書目資料
      const { data: newBook, error: bookErr } = await supabase
        .from('books')
        .insert({
          title: form.title,
          author: form.author,
          isbn: form.isbn,
          category: form.category,
          cover_url: coverUrl,
        })
        .select()
        .single();

      if (bookErr) throw bookErr;

      // 2. 依據設定數量自動產生實體副本條碼
      const copiesToInsert = Array.from({ length: Number(form.copyCount) }, (_, idx) => ({
        book_id: newBook.id,
        barcode: `${form.isbn}-${String(idx + 1).padStart(2, '0')}`,
        status: 'available',
      }));

      const { error: copyErr } = await supabase.from('book_copies').insert(copiesToInsert);
      if (copyErr) throw copyErr;

      setForm({ title: '', author: '', isbn: '', category: '資訊科技', copyCount: 1 });
      setCoverFile(null);
      e.target.reset();
      await fetchAllBooks();

      setModal({
        show: true,
        title: '上架成功',
        message: `已成功新增《${newBook.title}》並建立 ${copiesToInsert.length} 本實體副本！`,
        type: 'success',
      });
    } catch (err) {
      setModal({ show: true, title: '上架失敗', message: err.message, type: 'danger' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteBook = async (bookId, title) => {
    const { error } = await supabase.from('books').delete().eq('id', bookId);
    if (!error) {
      await fetchAllBooks();
      setModal({ show: true, title: '已刪除', message: `《${title}》已從館藏移除。`, type: 'info' });
    }
  };

  return (
    <div className="container pb-5">
      <h2 className="fw-bold mb-4">
        <i className="fa-solid fa-gauge-high me-2 text-warning"></i>館員後台管理系統
      </h2>

      {/* 新增書目表單 */}
      <div className="card shadow-sm border-0 mb-5">
        <div className="card-header bg-dark text-white fw-bold">
          <i className="fa-solid fa-plus-circle me-2"></i>新書建檔與館藏入庫
        </div>
        <div className="card-body">
          <form onSubmit={handleCreateBook} className="row g-3">
            <div className="col-md-4">
              <label className="form-label fw-medium">書名</label>
              <input
                type="text"
                className="form-control"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="col-md-3">
              <label className="form-label fw-medium">作者</label>
              <input
                type="text"
                className="form-control"
                required
                value={form.author}
                onChange={(e) => setForm({ ...form, author: e.target.value })}
              />
            </div>
            <div className="col-md-3">
              <label className="form-label fw-medium">ISBN 編號</label>
              <input
                type="text"
                className="form-control"
                required
                value={form.isbn}
                onChange={(e) => setForm({ ...form, isbn: e.target.value })}
              />
            </div>
            <div className="col-md-2">
              <label className="form-label fw-medium">分類</label>
              <select
                className="form-select"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                <option value="資訊科技">資訊科技</option>
                <option value="文學小說">文學小說</option>
                <option value="商業理財">商業理財</option>
                <option value="自然科學">自然科學</option>
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label fw-medium">封面圖片 (上傳至 Cloudinary)</label>
              <input
                type="file"
                className="form-control"
                accept="image/*"
                onChange={(e) => setCoverFile(e.target.files[0])}
              />
            </div>
            <div className="col-md-3">
              <label className="form-label fw-medium">初始入庫複本數</label>
              <input
                type="number"
                className="form-control"
                min="1"
                max="20"
                required
                value={form.copyCount}
                onChange={(e) => setForm({ ...form, copyCount: e.target.value })}
              />
            </div>
            <div className="col-md-3 d-flex align-items-end">
              <button type="submit" className="btn btn-primary w-100" disabled={submitting}>
                {submitting ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2"></span>處理中...
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-cloud-arrow-up me-2"></i>確認上架
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* 館藏清單管理 */}
      <div className="card shadow-sm border-0">
        <div className="card-header bg-white fw-bold">
          <i className="fa-solid fa-list-check me-2 text-primary"></i>現有館藏與副本狀態
        </div>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th>封面</th>
                <th>書名 / ISBN</th>
                <th>分類</th>
                <th>副本條碼與狀態</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {books.map((book) => (
                <tr key={book.id}>
                  <td>
                    <img
                      src={book.cover_url || 'https://placehold.co/50x70'}
                      alt={book.title}
                      className="rounded"
                      style={{ width: '45px', height: '65px', objectFit: 'cover' }}
                    />
                  </td>
                  <td>
                    <div className="fw-bold">{book.title}</div>
                    <small className="text-muted">{book.author} | ISBN: {book.isbn}</small>
                  </td>
                  <td><span className="badge bg-secondary">{book.category}</span></td>
                  <td>
                    <div className="d-flex flex-wrap gap-1">
                      {book.book_copies.map((c) => (
                        <span
                          key={c.id}
                          className={`badge ${c.status === 'available' ? 'bg-success' : 'bg-danger'}`}
                        >
                          {c.barcode} ({c.status === 'available' ? '在館' : '借出'})
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <button
                      className="btn btn-outline-danger btn-sm"
                      onClick={() => handleDeleteBook(book.id, book.title)}
                    >
                      <i className="fa-solid fa-trash"></i>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AppModal {...modal} onClose={() => setModal({ ...modal, show: false })} />
    </div>
  );
}
import React, { useState } from 'react';
import { libraryService } from '../lib/libraryService';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('circulation');
  const [message, setMessage] = useState(null);

  // 圖書建檔狀態
  const [bookForm, setBookForm] = useState({
    isbn: '', title: '', author: '', publisher: '', category: '資訊科學', tags: 'JavaScript,前端', copyCount: 2, location: 'A區-1架'
  });

  // 借還書掃碼狀態
  const [readerId, setReaderId] = useState('');
  const [barcode, setBarcode] = useState('');

  const handleCreateBook = async (e) => {
    e.preventDefault();
    try {
      const copies = Array.from({ length: Number(bookForm.copyCount) }, (_, i) => ({
        barcode: `${bookForm.isbn}-C${i + 1}`,
        location: bookForm.location
      }));
      await libraryService.createBookWithCopies(
        { ...bookForm, tags: bookForm.tags.split(',').map(t => t.trim()) },
        copies
      );
      setMessage({ type: 'success', text: `成功建立書目《${bookForm.title}》與 ${copies.length} 筆館藏副本！` });
    } catch (err) {
      setMessage({ type: 'danger', text: err.message });
    }
  };

  const handleBorrow = async () => {
    try {
      const res = await libraryService.borrowCopy(readerId, barcode);
      setMessage({ type: 'success', text: `借閱成功！應還日期：${new Date(res.due_date).toLocaleDateString()}` });
      setBarcode('');
    } catch (err) {
      setMessage({ type: 'danger', text: err.message });
    }
  };

  const handleReturn = async () => {
    try {
      const res = await libraryService.returnCopy(barcode);
      let msg = `歸還成功！逾期天數：${res.overdue_days} 天，罰金：$${res.fine_amount}。`;
      if (res.next_reserved_user_id) {
        msg += ` 【注意】本書已有讀者預約，已自動保留並通知第一順位讀者！`;
      }
      setMessage({ type: 'info', text: msg });
      setBarcode('');
    } catch (err) {
      setMessage({ type: 'danger', text: err.message });
    }
  };

  const handleDamage = async () => {
    try {
      const res = await libraryService.reportCopyDamaged(barcode);
      setMessage({
        type: 'warning',
        text: `條碼 ${barcode} 已標記損壞。剩餘健康副本：${res.healthy_copies_remaining} 本，自動取消超額預約數：${res.cancelled_reservation_ids.length} 筆。`
      });
    } catch (err) {
      setMessage({ type: 'danger', text: err.message });
    }
  };

  return (
    <div className="container py-4">
      <h2 className="mb-4">館員業務作業中心</h2>

      {message && (
        <div className={`alert alert-${message.type}`}>{message.text}</div>
      )}

      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button className={`nav-link ${activeTab === 'circulation' ? 'active' : ''}`} onClick={() => setActiveTab('circulation')}>
            借閱 / 歸還 / 損壞處理
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${activeTab === 'catalog' ? 'active' : ''}`} onClick={() => setActiveTab('catalog')}>
            新增書目與館藏副本
          </button>
        </li>
      </ul>

      {activeTab === 'circulation' ? (
        <div className="card p-4">
          <div className="mb-3">
            <label className="form-label">讀者 UUID（借書時必填）</label>
            <input type="text" className="form-control" value={readerId} onChange={e => setReaderId(e.target.value)} placeholder="掃描讀者證條碼..." />
          </div>
          <div className="mb-3">
            <label className="form-label">館藏條碼 (BookCopy Barcode)</label>
            <input type="text" className="form-control" value={barcode} onChange={e => setBarcode(e.target.value)} placeholder="掃描書籍條碼..." />
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-primary" onClick={handleBorrow}>確認借出</button>
            <button className="btn btn-success" onClick={handleReturn}>確認歸還</button>
            <button className="btn btn-outline-danger ms-auto" onClick={handleDamage}>回報館藏損壞</button>
          </div>
        </div>
      ) : (
        <form className="card p-4" onSubmit={handleCreateBook}>
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label">ISBN</label>
              <input required className="form-control" value={bookForm.isbn} onChange={e => setBookForm({ ...bookForm, isbn: e.target.value })} />
            </div>
            <div className="col-md-8">
              <label className="form-label">書名</label>
              <input required className="form-control" value={bookForm.title} onChange={e => setBookForm({ ...bookForm, title: e.target.value })} />
            </div>
            <div className="col-md-6">
              <label className="form-label">作者</label>
              <input required className="form-control" value={bookForm.author} onChange={e => setBookForm({ ...bookForm, author: e.target.value })} />
            </div>
            <div className="col-md-6">
              <label className="form-label">出版社</label>
              <input className="form-control" value={bookForm.publisher} onChange={e => setBookForm({ ...bookForm, publisher: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">分類</label>
              <input className="form-control" value={bookForm.category} onChange={e => setBookForm({ ...bookForm, category: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">上架副本數量</label>
              <input type="number" min="1" max="50" className="form-control" value={bookForm.copyCount} onChange={e => setBookForm({ ...bookForm, copyCount: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">預設館藏架位</label>
              <input className="form-control" value={bookForm.location} onChange={e => setBookForm({ ...bookForm, location: e.target.value })} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary mt-4">建立書目並產生副本條碼</button>
        </form>
      )}
    </div>
  );
}
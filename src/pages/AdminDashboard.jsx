import React, { useState } from 'react';
import { libraryService } from '../lib/libraryService';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('circulation');
  const [message, setMessage] = useState(null);

  const [bookForm, setBookForm] = useState({
    isbn: '',
    title: '',
    author: '',
    publisher: '',
    categoryCode: '800',
    category: '程式設計與資訊',
    copyCount: 2,
  });

  const [readerUserId, setReaderUserId] = useState('');
  const [barcode, setBarcode] = useState('');

  const [fineId, setFineId] = useState('');
  const [txType, setTxType] = useState('payment');
  const [txAmount, setTxAmount] = useState('');

  const handleCreateBook = async (e) => {
    e.preventDefault();
    try {
      const copies = Array.from({ length: Number(bookForm.copyCount) }, (_, i) => ({
        barcode: `${bookForm.isbn}-C${String(i + 1).padStart(3, '0')}`,
      }));
      const res = await libraryService.createNormalizedBookWithCopies(bookForm, copies);
      setMessage({
        type: 'success',
        text: `已建立正規化書目《${res.book.title}》（出版社：${res.publisher.name}、作者：${res.author.name}）及 ${res.copies.length} 筆獨立副本！`,
      });
    } catch (err) {
      setMessage({ type: 'danger', text: err.message });
    }
  };

  const handleBorrow = async () => {
    try {
      const res = await libraryService.borrowCopy(readerUserId, barcode);
      setMessage({
        type: 'success',
        text: `交易借出成功！借閱明細 ID：${res.loan_item_id}，應還日期：${new Date(res.due_date).toLocaleDateString()}`,
      });
      setBarcode('');
    } catch (err) {
      setMessage({ type: 'danger', text: err.message });
    }
  };

  const handleReturn = async () => {
    try {
      const res = await libraryService.returnCopy(barcode);
      let text = `歸還成功！逾期 ${res.overdue_days} 天，產生罰款 NT$ ${res.fine_amount}。`;
      if (res.fine_id) text += ` (罰款單號 ID: ${res.fine_id})`;
      setMessage({ type: 'info', text });
      setBarcode('');
    } catch (err) {
      setMessage({ type: 'danger', text: err.message });
    }
  };

  const handleFinanceTx = async (e) => {
    e.preventDefault();
    try {
      const res = await libraryService.payOrAdjustFine(fineId, txType, Number(txAmount), 'cash');
      setMessage({
        type: 'success',
        text: `帳務流水已寫入！交易單號：${res.payment_id}，目前累計實收：NT$ ${res.net_paid}，罰款狀態：${res.fine_status}`,
      });
    } catch (err) {
      setMessage({ type: 'danger', text: err.message });
    }
  };

  return (
    <div className="container py-4">
      <h2 className="fw-bold mb-4">館務管理與資料庫交易作業中心</h2>

      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'circulation' ? 'active' : ''}`}
            onClick={() => setActiveTab('circulation')}
          >
            流通借還（交易鎖定）
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'catalog' ? 'active' : ''}`}
            onClick={() => setActiveTab('catalog')}
          >
            正規化編目與副本建檔
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'finance' ? 'active' : ''}`}
            onClick={() => setActiveTab('finance')}
          >
            罰款繳費與帳務流水
          </button>
        </li>
      </ul>

      {activeTab === 'circulation' && (
        <div className="card p-4 shadow-sm border-0">
          <div className="mb-3">
            <label className="form-label">讀者 User UUID（借書必填）</label>
            <input
              type="text"
              className="form-control"
              value={readerUserId}
              onChange={(e) => setReaderUserId(e.target.value)}
              placeholder="輸入讀者帳號 UUID..."
            />
          </div>
          <div className="mb-3">
            <label className="form-label">實體副本條碼 (book_copies.barcode)</label>
            <input
              type="text"
              className="form-control"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="掃描書籍條碼..."
            />
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-primary" onClick={handleBorrow}>確認借出 (FOR UPDATE 鎖定)</button>
            <button className="btn btn-success" onClick={handleReturn}>確認歸還</button>
          </div>
        </div>
      )}

      {activeTab === 'catalog' && (
        <form className="card p-4 shadow-sm border-0" onSubmit={handleCreateBook}>
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label">ISBN</label>
              <input
                required
                className="form-control"
                value={bookForm.isbn}
                onChange={(e) => setBookForm({ ...bookForm, isbn: e.target.value })}
              />
            </div>
            <div className="col-md-8">
              <label className="form-label">書名</label>
              <input
                required
                className="form-control"
                value={bookForm.title}
                onChange={(e) => setBookForm({ ...bookForm, title: e.target.value })}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label">作者 (寫入 authors 與 book_authors)</label>
              <input
                required
                className="form-control"
                value={bookForm.author}
                onChange={(e) => setBookForm({ ...bookForm, author: e.target.value })}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label">出版社 (寫入 publishers)</label>
              <input
                required
                className="form-control"
                value={bookForm.publisher}
                onChange={(e) => setBookForm({ ...bookForm, publisher: e.target.value })}
              />
            </div>
            <div className="col-md-2">
              <label className="form-label">分類號</label>
              <input
                required
                className="form-control"
                value={bookForm.categoryCode}
                onChange={(e) => setBookForm({ ...bookForm, categoryCode: e.target.value })}
              />
            </div>
            <div className="col-md-2">
              <label className="form-label">副本數</label>
              <input
                type="number"
                min="1"
                max="50"
                className="form-control"
                value={bookForm.copyCount}
                onChange={(e) => setBookForm({ ...bookForm, copyCount: e.target.value })}
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary mt-4">建立正規化書目與副本</button>
        </form>
      )}

      {activeTab === 'finance' && (
        <form className="card p-4 shadow-sm border-0" onSubmit={handleFinanceTx}>
          <div className="row g-3">
            <div className="col-md-5">
              <label className="form-label">罰款紀錄 UUID (fines.id)</label>
              <input
                required
                className="form-control"
                value={fineId}
                onChange={(e) => setFineId(e.target.value)}
              />
            </div>
            <div className="col-md-3">
              <label className="form-label">交易類型</label>
              <select className="form-select" value={txType} onChange={(e) => setTxType(e.target.value)}>
                <option value="payment">繳費 (payment)</option>
                <option value="waiver">折抵減免 (waiver)</option>
                <option value="refund">退款 (refund)</option>
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label">交易金額 (NT$)</label>
              <input
                type="number"
                min="1"
                required
                className="form-control"
                value={txAmount}
                onChange={(e) => setTxAmount(e.target.value)}
              />
            </div>
          </div>
          <button type="submit" className="btn btn-warning mt-4 fw-bold">寫入獨立帳務交易流水</button>
        </form>
      )}
    </div>
  );
}
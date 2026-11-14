import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { usePermission } from '../hooks/usePermission';
import PermissionGuard from '../components/PermissionGuard';
import { ROLE_LABELS } from '../config/permissions';

export default function AdminDashboard() {
  const { role, can, loading } = usePermission();
  const [books, setBooks] = useState([]);
  const [borrows, setBorrows] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [maxBorrowDays, setMaxBorrowDays] = useState(14);
  const [newTitle, setNewTitle] = useState('');
  const [newAuthor, setNewAuthor] = useState('');
  const [newIsbn, setNewIsbn] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    if (!loading) {
      loadBooks();
      if (can('borrow.approve') || can('borrow.return')) loadBorrows();
      if (can('audit.read')) loadAuditLogs();
      loadSystemSettings();
    }
  }, [loading, role]);

  const loadBooks = async () => {
    const { data } = await supabase.from('books').select('*').order('created_at', { ascending: false });
    if (data) setBooks(data);
  };

  const loadBorrows = async () => {
    const { data } = await supabase.from('borrows').select('*').order('created_at', { ascending: false });
    if (data) setBorrows(data);
  };

  const loadAuditLogs = async () => {
    const { data } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(20);
    if (data) setAuditLogs(data);
  };

  const loadSystemSettings = async () => {
    const { data } = await supabase.from('system_settings').select('value').eq('key', 'max_borrow_days').single();
    if (data?.value?.days) setMaxBorrowDays(data.value.days);
  };

  // 新增書籍 (book.create)
  const handleCreateBook = async (e) => {
    e.preventDefault();
    if (!newTitle.trim() || !newIsbn.trim()) return;
    const { error } = await supabase.from('books').insert([
      {
        title: newTitle.trim(),
        author: newAuthor.trim(),
        isbn: newIsbn.trim(),
        available: true,
      },
    ]);
    if (error) {
      setStatusMsg(`新增失敗：${error.message}`);
    } else {
      setStatusMsg('書籍新增成功，已寫入稽核日誌。');
      setNewTitle('');
      setNewAuthor('');
      setNewIsbn('');
      loadBooks();
    }
  };

  // 更新書籍 (book.update)
  const handleToggleAvailability = async (book) => {
    const { error } = await supabase
      .from('books')
      .update({ available: !book.available })
      .eq('id', book.id);
    if (error) {
      setStatusMsg(`更新失敗（後端 RLS 拒絕）：${error.message}`);
    } else {
      setStatusMsg(`已更新《${book.title}》館藏狀態。`);
      loadBooks();
    }
  };

  // 刪除書籍 (book.delete)
  const handleDeleteBook = async (bookId) => {
    const { error } = await supabase.from('books').delete().eq('id', bookId);
    if (error) {
      setStatusMsg(`刪除失敗（後端 RLS 拒絕）：${error.message}`);
    } else {
      setStatusMsg('書籍已刪除。');
      loadBooks();
    }
  };

  // 借閱審核與歸還 (borrow.approve / borrow.return)
  const handleBorrowStatus = async (borrowId, newStatus) => {
    const { error } = await supabase
      .from('borrows')
      .update({ status: newStatus })
      .eq('id', borrowId);
    if (error) {
      setStatusMsg(`借閱操作失敗：${error.message}`);
    } else {
      setStatusMsg(`借閱單狀態已變更為：${newStatus}`);
      loadBorrows();
    }
  };

  // 修改系統設定 (system.settings)
  const handleUpdateSettings = async (e) => {
    e.preventDefault();
    const { error } = await supabase
      .from('system_settings')
      .update({ value: { days: Number(maxBorrowDays) } })
      .eq('key', 'max_borrow_days');
    if (error) {
      setStatusMsg(`系統設定儲存失敗（後端 RLS 拒絕）：${error.message}`);
    } else {
      setStatusMsg('全系統最大借閱天數已更新。');
    }
  };

  if (loading) return <div className="container mt-4">載入權限設定中...</div>;

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2>館務管理後台</h2>
        <span className="badge bg-primary fs-6">當前角色：{ROLE_LABELS[role]}</span>
      </div>

      {statusMsg && (
        <div className="alert alert-info alert-dismissible fade show">
          {statusMsg}
          <button type="button" className="btn-close" onClick={() => setStatusMsg('')}></button>
        </div>
      )}

      {/* 區塊 1：書籍管理 */}
      <div className="card mb-4">
        <div className="card-header fw-bold">書籍館藏管理</div>
        <div className="card-body">
          <PermissionGuard permission="book.create">
            <form className="row g-2 mb-3" onSubmit={handleCreateBook}>
              <div className="col-md-4">
                <input
                  type="text"
                  className="form-control"
                  placeholder="輸入書名 *"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                />
              </div>
              <div className="col-md-3">
                <input
                  type="text"
                  className="form-control"
                  placeholder="輸入作者"
                  value={newAuthor}
                  onChange={(e) => setNewAuthor(e.target.value)}
                />
              </div>
              <div className="col-md-3">
                <input
                  type="text"
                  className="form-control"
                  placeholder="輸入 ISBN *"
                  value={newIsbn}
                  onChange={(e) => setNewIsbn(e.target.value)}
                  required
                />
              </div>
              <div className="col-md-2">
                <button type="submit" className="btn btn-success w-100">
                  + 新增書籍
                </button>
              </div>
            </form>
          </PermissionGuard>

          <table className="table table-bordered align-middle">
            <thead>
              <tr>
                <th>書名</th>
                <th>作者</th>
                <th>ISBN</th>
                <th>狀態</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {books.map((book) => (
                <tr key={book.id}>
                  <td>{book.title}</td>
                  <td>{book.author}</td>
                  <td>{book.isbn}</td>
                  <td>{book.available ? '在館可借' : '已借出'}</td>
                  <td className="d-flex gap-2">
                    <PermissionGuard permission="book.update">
                      <button
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => handleToggleAvailability(book)}
                      >
                        切換狀態
                      </button>
                    </PermissionGuard>

                    <PermissionGuard
                      permission="book.delete"
                      fallback={<span className="text-muted small align-self-center">無刪除權限</span>}
                    >
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDeleteBook(book.id)}
                      >
                        刪除書籍
                      </button>
                    </PermissionGuard>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 區塊 2：借閱審核與歸還 */}
      <PermissionGuard permission="borrow.approve">
        <div className="card mb-4">
          <div className="card-header fw-bold">借閱申請審核與歸還作業</div>
          <div className="card-body">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>借閱單號</th>
                  <th>書籍 ID</th>
                  <th>目前狀態</th>
                  <th>審核 / 歸還操作</th>
                </tr>
              </thead>
              <tbody>
                {borrows.map((item) => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>{item.book_id}</td>
                    <td>{item.status}</td>
                    <td className="d-flex gap-2">
                      <PermissionGuard permission="borrow.approve">
                        <button
                          className="btn btn-sm btn-warning"
                          onClick={() => handleBorrowStatus(item.id, 'approved')}
                        >
                          核准借閱
                        </button>
                      </PermissionGuard>
                      <PermissionGuard permission="borrow.return">
                        <button
                          className="btn btn-sm btn-info"
                          onClick={() => handleBorrowStatus(item.id, 'returned')}
                        >
                          辦理歸還
                        </button>
                      </PermissionGuard>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </PermissionGuard>

      {/* 區塊 3：全系統設定 */}
      <PermissionGuard
        permission="system.settings"
        fallback={
          <div className="alert alert-secondary">
            系統底層參數設定僅限超級管理員 (Super Admin) 存取。
          </div>
        }
      >
        <div className="card border-danger mb-4">
          <div className="card-header bg-danger text-white fw-bold">全系統參數設定 (Super Admin 專屬)</div>
          <div className="card-body">
            <form className="row g-2 align-items-center" onSubmit={handleUpdateSettings}>
              <div className="col-auto">
                <label className="col-form-label">全館預設最大借閱天數：</label>
              </div>
              <div className="col-auto">
                <input
                  type="number"
                  className="form-control"
                  value={maxBorrowDays}
                  onChange={(e) => setMaxBorrowDays(e.target.value)}
                />
              </div>
              <div className="col-auto">
                <button type="submit" className="btn btn-danger">儲存系統設定</button>
              </div>
            </form>
          </div>
        </div>
      </PermissionGuard>

      {/* 區塊 4：操作稽核紀錄 */}
      <PermissionGuard permission="audit.read">
        <div className="card">
          <div className="card-header fw-bold">系統重要操作稽核紀錄 (Audit Logs)</div>
          <div className="card-body">
            <table className="table table-striped table-sm">
              <thead>
                <tr>
                  <th>時間</th>
                  <th>操作者</th>
                  <th>動作</th>
                  <th>資料表</th>
                  <th>紀錄 ID</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{new Date(log.created_at).toLocaleString()}</td>
                    <td>{log.operator_email}</td>
                    <td>{log.action}</td>
                    <td>{log.table_name}</td>
                    <td>{log.record_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </PermissionGuard>
    </div>
  );
}
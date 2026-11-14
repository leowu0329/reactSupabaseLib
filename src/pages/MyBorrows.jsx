import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import AppModal from '../components/AppModal';

export default function MyBorrows({ user }) {
  const [records, setRecords] = useState([]);
  const [modal, setModal] = useState({ show: false, title: '', message: '', type: 'info' });

  const fetchRecords = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('borrow_records')
      .select(`
        id, borrowed_at, due_date, returned_at,
        book_copies (
          id, barcode,
          books (title, author)
        )
      `)
      .eq('user_id', user.id)
      .order('borrowed_at', { ascending: false });

    if (data) setRecords(data);
  };

  useEffect(() => {
    fetchRecords();
  }, [user]);

  const handleReturn = async (record) => {
    try {
      // 1. 更新歸還時間
      await supabase
        .from('borrow_records')
        .update({ returned_at: new Date().toISOString() })
        .eq('id', record.id);

      // 2. 釋放副本狀態為 available
      await supabase
        .from('book_copies')
        .update({ status: 'available' })
        .eq('id', record.book_copies.id);

      await fetchRecords();
      setModal({
        show: true,
        title: '歸還完成',
        message: `感謝您歸還《${record.book_copies.books.title}》！`,
        type: 'success',
      });
    } catch (err) {
      setModal({ show: true, title: '錯誤', message: err.message, type: 'danger' });
    }
  };

  return (
    <div className="container pb-5">
      <h2 className="fw-bold mb-4">
        <i className="fa-solid fa-clock-rotate-left me-2 text-primary"></i>我的借閱紀錄
      </h2>
      <div className="card shadow-sm border-0">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th>書名</th>
                <th>館藏條碼</th>
                <th>借閱日期</th>
                <th>應還日期</th>
                <th>狀態</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {records.map((rec) => (
                <tr key={rec.id}>
                  <td className="fw-medium">{rec.book_copies?.books?.title}</td>
                  <td><code>{rec.book_copies?.barcode}</code></td>
                  <td>{new Date(rec.borrowed_at).toLocaleDateString()}</td>
                  <td>{new Date(rec.due_date).toLocaleDateString()}</td>
                  <td>
                    {rec.returned_at ? (
                      <span className="badge bg-success">已歸還 ({new Date(rec.returned_at).toLocaleDateString()})</span>
                    ) : (
                      <span className="badge bg-warning text-dark">借閱中</span>
                    )}
                  </td>
                  <td>
                    {!rec.returned_at && (
                      <button className="btn btn-outline-primary btn-sm" onClick={() => handleReturn(rec)}>
                        <i className="fa-solid fa-rotate-left me-1"></i> 歸還書籍
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr>
                  <td colSpan="6" className="text-center py-4 text-muted">尚無借閱紀錄</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <AppModal {...modal} onClose={() => setModal({ ...modal, show: false })} />
    </div>
  );
}
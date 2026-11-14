import React, { useEffect, useState } from 'react';
import { libraryService } from '../lib/libraryService';
import { supabase } from '../lib/supabase';

export default function MyBorrows() {
  const [borrows, setBorrows] = useState([]);
  const [reservations, setReservations] = useState([]);

  const fetchPersonalRecords = async () => {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) return;
    const [bList, rList] = await Promise.all([
      libraryService.getUserBorrows(authData.user.id),
      libraryService.getUserReservations(authData.user.id)
    ]);
    setBorrows(bList);
    setReservations(rList);
  };

  useEffect(() => { fetchPersonalRecords(); }, []);

  const handleCancelReservation = async (resId) => {
    await libraryService.cancelReservation(resId);
    fetchPersonalRecords();
  };

  return (
    <div className="container py-4">
      <h3 className="mb-3">我的借閱紀錄</h3>
      <table className="table table-bordered mb-5">
        <thead>
          <tr>
            <th>書名</th>
            <th>副本條碼</th>
            <th>應還日期</th>
            <th>狀態 / 罰金</th>
          </tr>
        </thead>
        <tbody>
          {borrows.map(b => (
            <tr key={b.id}>
              <td>{b.book_copies?.books?.title}</td>
              <td>{b.book_copies?.barcode}</td>
              <td>{new Date(b.due_date).toLocaleDateString()}</td>
              <td>{b.status === 'active' ? '借閱中' : `已歸還 (罰金 $${b.fine_amount})`}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="mb-3">我的預約清單</h3>
      <table className="table table-bordered">
        <thead>
          <tr>
            <th>書名</th>
            <th>預約狀態</th>
            <th>取書期限</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {reservations.map(r => (
            <tr key={r.id}>
              <td>{r.books?.title}</td>
              <td>{r.status}</td>
              <td>{r.pickup_deadline ? new Date(r.pickup_deadline).toLocaleString() : '排隊候補中'}</td>
              <td>
                {['pending', 'ready_for_pickup'].includes(r.status) && (
                  <button className="btn btn-sm btn-danger" onClick={() => handleCancelReservation(r.id)}>
                    取消預約
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
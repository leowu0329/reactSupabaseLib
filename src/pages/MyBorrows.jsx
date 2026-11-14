import React, { useEffect, useState } from 'react';
import { libraryService } from '../lib/libraryService';
import { supabase } from '../lib/supabase';

export default function MyBorrows() {
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchRecords = async () => {
    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) return;

    const member = await libraryService.ensureMemberProfile(authData.user.id, authData.user.email);
    const history = await libraryService.getMemberLoanHistory(member.id);
    setLoans(history || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  if (loading) {
    return (
      <div className="container py-5 text-center">
        <div className="spinner-border text-primary" role="status"></div>
      </div>
    );
  }

  return (
    <div className="container py-4">
      <h3 className="fw-bold mb-3">我的借閱歷史與明細 (不可刪除永久保存)</h3>
      <div className="table-responsive mb-5">
        <table className="table table-bordered bg-white align-middle">
          <thead className="table-light">
            <tr>
              <th>借閱單號</th>
              <th>書名 / ISBN</th>
              <th>副本條碼</th>
              <th>應還日期</th>
              <th>明細狀態</th>
              <th>逾期罰款與繳費流水</th>
            </tr>
          </thead>
          <tbody>
            {loans.flatMap((loan) =>
              (loan.loan_items || []).map((item) => (
                <tr key={item.id}>
                  <td className="small text-muted">{loan.loan_no}</td>
                  <td>
                    <div className="fw-bold">{item.book_copies?.books?.title}</div>
                    <small className="text-muted">{item.book_copies?.books?.isbn}</small>
                  </td>
                  <td><code>{item.book_copies?.barcode}</code></td>
                  <td>{new Date(item.due_date).toLocaleDateString()}</td>
                  <td>
                    <span className={`badge ${item.status === 'returned' ? 'bg-success' : 'bg-primary'}`}>
                      {item.status === 'returned' ? '已歸還' : '借閱中'}
                    </span>
                  </td>
                  <td>
                    {item.fines && item.fines.length > 0 ? (
                      item.fines.map((f) => (
                        <div key={f.id} className="small">
                          <span className="text-danger fw-bold">
                            罰款 NT$ {f.amount} ({f.status})
                          </span>
                          {(f.payments || []).map((p) => (
                            <div key={p.id} className="text-muted">
                              └ [{p.transaction_type}] NT$ {p.amount} ({p.receipt_no})
                            </div>
                          ))}
                        </div>
                      ))
                    ) : (
                      <span className="text-muted small">無罰款</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
import React, { useState, useRef, useEffect } from 'react';
import { checkoutCopy, checkinCopy } from '../lib/circulationService';
import { useUiStore } from '../store/useUiStore';
import CopyStateBadge from '../components/CopyStateBadge';

export default function CirculationDesk({ defaultMode = 'checkout' }) {
  const [mode, setMode] = useState(defaultMode);
  const [memberBarcode, setMemberBarcode] = useState('');
  const [copyBarcode, setCopyBarcode] = useState('');
  const [errors, setErrors] = useState({});
  const [recentLogs, setRecentLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const memberInputRef = useRef(null);
  const copyInputRef = useRef(null);
  const { showToast } = useUiStore();

  useEffect(() => {
    setMode(defaultMode);
  }, [defaultMode]);

  useEffect(() => {
    if (mode === 'checkout') {
      memberInputRef.current?.focus();
    } else {
      copyInputRef.current?.focus();
    }
  }, [mode]);

  const handleMemberKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!memberBarcode.trim()) {
        setErrors({ memberBarcode: '請掃描或輸入讀者證條碼' });
        return;
      }
      setErrors({});
      copyInputRef.current?.focus();
    }
  };

  const handleCopySubmit = async (e) => {
    e.preventDefault();
    const nextErrors = {};
    if (mode === 'checkout' && !memberBarcode.trim()) {
      nextErrors.memberBarcode = '借書前必須先掃描讀者證條碼';
    }
    if (!copyBarcode.trim()) {
      nextErrors.copyBarcode = '請掃描或輸入館藏副本條碼';
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setLoading(true);
    try {
      if (mode === 'checkout') {
        const res = await checkoutCopy({ memberCode: memberBarcode.trim(), barcode: copyBarcode.trim() });
        showToast(`借出成功！條碼：${copyBarcode}`, 'success');
        setRecentLogs((prev) => [
          { id: Date.now(), action: '借出', barcode: copyBarcode, member: memberBarcode, status: 'checked_out', detail: res?.due_date || '已更新借閱期限' },
          ...prev,
        ]);
      } else {
        const res = await checkinCopy({ barcode: copyBarcode.trim() });
        showToast(`歸還成功！條碼：${copyBarcode}`, 'success');
        setRecentLogs((prev) => [
          { id: Date.now(), action: '歸還', barcode: copyBarcode, member: '-', status: res?.nextStatus || 'available', detail: '已重新上架/通知預約' },
          ...prev,
        ]);
      }
      setCopyBarcode('');
      copyInputRef.current?.focus();
    } catch (err) {
      showToast(err.message || '條碼作業失敗，請檢查館藏或讀者狀態', 'danger');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-fluid px-0">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0 fw-bold">
          <i className="bi bi-upc-scan me-2 text-primary" />
          條碼流通工作台
        </h4>
        <div className="btn-group" role="group" aria-label="切換作業模式">
          <button
            type="button"
            className={`btn ${mode === 'checkout' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setMode('checkout')}
          >
            圖書借出
          </button>
          <button
            type="button"
            className={`btn ${mode === 'checkin' ? 'btn-success' : 'btn-outline-success'}`}
            onClick={() => setMode('checkin')}
          >
            圖書歸還
          </button>
        </div>
      </div>

      <div className="card shadow-sm border-0 mb-4">
        <div className="card-body p-4">
          <form onSubmit={handleCopySubmit} noValidate>
            <div className="row g-3 align-items-start">
              {mode === 'checkout' && (
                <div className="col-md-5">
                  <label htmlFor="memberBarcodeInput" className="form-label fw-semibold">
                    1. 讀者證條碼（掃描後自動跳轉）
                  </label>
                  <input
                    id="memberBarcodeInput"
                    ref={memberInputRef}
                    type="text"
                    className={`form-control form-control-lg ${errors.memberBarcode ? 'is-invalid' : ''}`}
                    placeholder="請掃描讀者證條碼 (例: MEM-2026001)"
                    value={memberBarcode}
                    onChange={(e) => setMemberBarcode(e.target.value)}
                    onKeyDown={handleMemberKeyDown}
                  />
                  {errors.memberBarcode && <div className="invalid-feedback">{errors.memberBarcode}</div>}
                </div>
              )}

              <div className={mode === 'checkout' ? 'col-md-5' : 'col-md-9'}>
                <label htmlFor="copyBarcodeInput" className="form-label fw-semibold">
                  {mode === 'checkout' ? '2. 館藏副本條碼（掃描即自動送出）' : '館藏副本條碼（掃描即自動歸還）'}
                </label>
                <input
                  id="copyBarcodeInput"
                  ref={copyInputRef}
                  type="text"
                  className={`form-control form-control-lg ${errors.copyBarcode ? 'is-invalid' : ''}`}
                  placeholder="請掃描書籍條碼 (例: BK-10001)"
                  value={copyBarcode}
                  onChange={(e) => setCopyBarcode(e.target.value)}
                />
                {errors.copyBarcode && <div className="invalid-feedback">{errors.copyBarcode}</div>}
              </div>

              <div className="col-md-2 d-grid" style={{ marginTop: '2.9rem' }}>
                <button type="submit" className="btn btn-dark btn-lg" disabled={loading}>
                  {loading ? '處理中...' : '執行'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <div className="card shadow-sm border-0">
        <div className="card-header bg-white fw-semibold">本次櫃台掃描作業紀錄</div>
        <div className="table-responsive">
          <table className="table align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th>作業類型</th>
                <th>館藏條碼</th>
                <th>讀者證號</th>
                <th>更新後狀態</th>
                <th>備註</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center text-muted py-3">
                    請使用條碼掃描槍開始作業
                  </td>
                </tr>
              ) : (
                recentLogs.map((log) => (
                  <tr key={log.id}>
                    <td><strong>{log.action}</strong></td>
                    <td><code>{log.barcode}</code></td>
                    <td>{log.member}</td>
                    <td><CopyStateBadge status={log.status} /></td>
                    <td>{log.detail}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
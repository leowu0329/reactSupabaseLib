import React, { useState } from 'react';
import { circulationService } from '../lib/circulationService';
import { reservationService } from '../lib/reservationService';

export default function CirculationDesk() {
  const [mode, setMode] = useState('BORROW'); // 'BORROW' | 'RETURN'
  const [memberId, setMemberId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeQueue, setBarcodeQueue] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleAddBarcode = (e) => {
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;
    if (!barcodeQueue.includes(code)) {
      setBarcodeQueue([...barcodeQueue, code]);
    }
    setBarcodeInput('');
  };

  const handleExecuteBatch = async () => {
    if (barcodeQueue.length === 0) return;
    setLoading(true);
    try {
      if (mode === 'BORROW') {
        if (!memberId) throw new Error('請先掃描或輸入讀者 ID');
        const results = await circulationService.batchBorrow({
          barcodes: barcodeQueue,
          memberId,
          currentBranchId: branchId || null
        });
        setLogs((prev) => [...results.map((r) => ({ type: 'BORROW', ...r })), ...prev]);
      } else {
        const results = await circulationService.batchReturn({
          barcodes: barcodeQueue,
          returnBranchId: branchId || null
        });
        setLogs((prev) => [...results.map((r) => ({ type: 'RETURN', ...r })), ...prev]);
      }
      setBarcodeQueue([]);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRunReservationCleanup = async () => {
    const expiredCount = await reservationService.expireOverduePickups();
    alert(`已自動清理 ${expiredCount} 筆逾期未取書的預約紀錄`);
  };

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="fw-bold">
          <i className="fa-solid fa-barcode me-2 text-primary"></i>圖書流通櫃台作業
        </h2>
        <button className="btn btn-outline-warning" onClick={handleRunReservationCleanup}>
          <i className="fa-solid fa-clock-rotate-left me-1"></i>清理逾期未取預約
        </button>
      </div>

      <div className="btn-group mb-4">
        <button
          className={`btn ${mode === 'BORROW' ? 'btn-primary' : 'btn-outline-primary'}`}
          onClick={() => setMode('BORROW')}
        >
          批次掃描借閱
        </button>
        <button
          className={`btn ${mode === 'RETURN' ? 'btn-success' : 'btn-outline-success'}`}
          onClick={() => setMode('RETURN')}
        >
          批次掃描歸還
        </button>
      </div>

      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <div className="row g-3 mb-3">
            {mode === 'BORROW' && (
              <div className="col-md-6">
                <label className="form-label fw-semibold">讀者 UUID / 掃描讀者證</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="輸入讀者 ID..."
                  value={memberId}
                  onChange={(e) => setMemberId(e.target.value)}
                />
              </div>
            )}
            <div className="col-md-6">
              <label className="form-label fw-semibold">作業分館 ID（留空預設原館）</label>
              <input
                type="text"
                className="form-control"
                placeholder="輸入分館 UUID..."
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
              />
            </div>
          </div>

          <form onSubmit={handleAddBarcode} className="d-flex gap-2 mb-3">
            <input
              type="text"
              className="form-control"
              placeholder="掃描書籍條碼 (如 LIB-123456-001) 後按 Enter..."
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
            />
            <button type="submit" className="btn btn-secondary text-nowrap">
              加入佇列
            </button>
          </form>

          <div className="mb-3">
            <span className="text-muted small">待處理條碼 ({barcodeQueue.length})：</span>
            <div className="d-flex flex-wrap gap-2 mt-1">
              {barcodeQueue.map((code) => (
                <span key={code} className="badge bg-light text-dark border p-2">
                  {code}
                  <button
                    type="button"
                    className="btn-close ms-2"
                    style={{ fontSize: '0.6rem' }}
                    onClick={() => setBarcodeQueue(barcodeQueue.filter((c) => c !== code))}
                  ></button>
                </span>
              ))}
            </div>
          </div>

          <button
            className="btn btn-primary w-100"
            disabled={loading || barcodeQueue.length === 0}
            onClick={handleExecuteBatch}
          >
            {loading ? '處理中...' : `確認執行批次${mode === 'BORROW' ? '借閱' : '歸還'}`}
          </button>
        </div>
      </div>

      <div className="card shadow-sm">
        <div className="card-header fw-bold">作業執行結果紀錄</div>
        <ul className="list-group list-group-flush">
          {logs.map((log, idx) => (
            <li key={idx} className="list-group-item d-flex justify-content-between align-items-center">
              <div>
                <span className={`badge me-2 ${log.success ? 'bg-success' : 'bg-danger'}`}>
                  {log.type}
                </span>
                <strong>{log.barcode}</strong>
                {log.success ? (
                  <span className="ms-2 text-muted">
                    {log.data.bookTitle}
                    {log.data.fine && ` | 產生逾期罰款 NT$${log.data.fine.calculated_amount}`}
                    {log.data.assignedReservation &&
                      ` | 已自動保留給預約者: ${log.data.assignedReservation.member?.full_name}`}
                  </span>
                ) : (
                  <span className="ms-2 text-danger">{log.error}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
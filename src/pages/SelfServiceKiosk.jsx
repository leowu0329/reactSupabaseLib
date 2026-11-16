import React, { useState } from 'react';
import { extensibilityService } from '../lib/extensibilityService';
import { circulationService } from '../lib/circulationService';
import { useLibraryStore } from '../store/useLibraryStore';
import { useUiStore } from '../store/useUiStore';

export default function SelfServiceKiosk() {
  const activeBranchId = useLibraryStore((s) => s.activeBranchId);
  const { showToast } = useUiStore();

  const [memberQrToken, setMemberQrToken] = useState('');
  const [scanInput, setScanInput] = useState('');
  const [scannedItems, setScannedItems] = useState([]);
  const [receipt, setReceipt] = useState(null);
  const [processing, setProcessing] = useState(false);

  const handleAddItem = (e) => {
    e.preventDefault();
    const val = scanInput.trim();
    if (!val) return;
    if (!scannedItems.includes(val)) {
      setScannedItems((prev) => [...prev, val]);
    }
    setScanInput('');
  };

  const handleCheckout = async () => {
    if (!memberQrToken.trim() || scannedItems.length === 0) {
      showToast('請先掃描數位讀者證 QR Code 並感應至少一本館藏', 'warning');
      return;
    }

    setProcessing(true);
    try {
      const res = await extensibilityService.selfServiceCheckout(
        {
          memberQrToken: memberQrToken.trim(),
          itemIdentifiers: scannedItems,
          branchId: activeBranchId,
        },
        circulationService
      );
      setReceipt(res);
      setScannedItems([]);
      showToast(`自助借書完成，共 ${res.count} 冊！電子收據已發送`, 'success');
    } catch (err) {
      showToast(err.message, 'danger');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="container py-4" style={{ maxWidth: 760 }}>
      <div className="card shadow-sm border-0">
        <div className="card-header bg-dark text-white d-flex justify-content-between align-items-center">
          <h5 className="mb-0 fw-bold">
            <i className="bi bi-qr-code-scan me-2" />
            智慧圖書館自助借還機 (RFID / QR Code Kiosk)
          </h5>
          <span className="badge bg-success">連線中</span>
        </div>

        <div className="card-body p-4">
          <div className="mb-3">
            <label className="form-label fw-semibold">步驟 1：掃描手機 QR Code 讀者證</label>
            <input
              type="text"
              className="form-control form-control-lg"
              placeholder="請掃描 LIBQR:... 讀者憑證"
              value={memberQrToken}
              onChange={(e) => setMemberQrToken(e.target.value)}
            />
          </div>

          <form onSubmit={handleAddItem} className="mb-3">
            <label className="form-label fw-semibold">步驟 2：感應書籍 RFID 標籤或掃描館藏 QR / 條碼</label>
            <div className="input-group input-group-lg">
              <input
                type="text"
                className="form-control"
                placeholder="感應 EPC-... / LIBQR:... / 館藏條碼"
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
              />
              <button type="submit" className="btn btn-outline-primary">
                加入清單
              </button>
            </div>
          </form>

          {scannedItems.length > 0 && (
            <ul className="list-group mb-3">
              {scannedItems.map((item, idx) => (
                <li key={item} className="list-group-item d-flex justify-content-between align-items-center">
                  <span>
                    #{idx + 1} <code>{item}</code>
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => setScannedItems((prev) => prev.filter((x) => x !== item))}
                  >
                    移除
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            className="btn btn-primary btn-lg w-100"
            disabled={processing || scannedItems.length === 0}
            onClick={handleCheckout}
          >
            {processing ? '交易處理中...' : `確認自助借出 (${scannedItems.length} 冊)`}
          </button>

          {receipt && (
            <div className="alert alert-success mt-4 mb-0">
              <h6 className="fw-bold">自助借閱交易成功！</h6>
              <p className="mb-1">讀者：{receipt.member.full_name} ({receipt.member.member_code})</p>
              <p className="mb-0">已成功借閱 {receipt.count} 冊，系統已自動派發 Email / LINE 借閱通知。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
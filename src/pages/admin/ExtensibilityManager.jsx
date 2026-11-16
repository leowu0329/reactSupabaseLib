import React, { useState } from 'react';
import DataTable from '../../components/DataTable';
import CopyStateBadge from '../../components/CopyStateBadge';
import { extensibilityService } from '../../lib/extensibilityService';
import { useUiStore } from '../../store/useUiStore';

export default function ExtensibilityManager({ activeTab }) {
  const { showToast } = useUiStore();
  const [isbnInput, setIsbnInput] = useState('9780134685991');
  const [isbnPreview, setIsbnPreview] = useState(null);

  const handleFetchIsbn = async () => {
    try {
      const meta = await extensibilityService.fetchBookMetadataByIsbn(isbnInput);
      setIsbnPreview(meta);
      showToast(`已成功透過 ${meta.source} 取得書目資訊`, 'success');
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  const titles = {
    'ext-branches': '多分館管理與跨館借還調撥',
    'ext-rfid': 'RFID 自助借還與高頻盤點作業',
    'ext-ebooks': '電子書與數位授權資源管理',
    'ext-notifications': 'Email 到期通知與 LINE 讀者即時推播',
    'ext-ai': 'AI 智慧閱讀推薦引擎',
  };

  return (
    <div>
      <h4 className="fw-bold mb-3">{titles[activeTab] || '系統擴充中心'}</h4>

      {/* ISBN API 快速編目測試面板 */}
      <div className="card mb-4 border-0 shadow-sm">
        <div className="card-body">
          <h6 className="fw-bold mb-2">ISBN API 自動帶入書目測試</h6>
          <div className="input-group" style={{ maxWidth: 480 }}>
            <input
              type="text"
              className="form-control"
              value={isbnInput}
              onChange={(e) => setIsbnInput(e.target.value)}
              placeholder="輸入 10 或 13 碼 ISBN..."
            />
            <button type="button" className="btn btn-primary" onClick={handleFetchIsbn}>
              查詢 ISBN 書目
            </button>
          </div>
          {isbnPreview && (
            <div className="alert alert-info mt-3 mb-0">
              <strong>{isbnPreview.title}</strong> — {isbnPreview.author}（{isbnPreview.publisher}, {isbnPreview.publish_year}）
            </div>
          )}
        </div>
      </div>

      <DataTable
        searchPlaceholder="搜尋擴充模組紀錄..."
        columns={[
          { key: 'module', label: '擴充模組' },
          { key: 'identifier', label: '識別碼 / 單號' },
          { key: 'detail', label: '摘要說明' },
          { key: 'status', label: '狀態', render: (v) => <CopyStateBadge status={v} /> },
        ]}
        data={[
          { module: '跨館借閱', identifier: 'TRF-202611-01', detail: '總館 → 東區分館 館際調撥', status: 'available' },
          { module: '電子書 DRM', identifier: 'EBOOK-EPUB-001', detail: '同時在線授權 3 席', status: 'available' },
          { module: 'LINE 通知', identifier: 'LINE-PUSH-882', detail: '預約到館即時提醒已發送', status: 'available' },
        ]}
      />
    </div>
  );
}
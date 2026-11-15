// src/components/ConfirmModal.jsx
import React, { useState } from 'react';
import { useUiStore } from '../store/useUiStore';

export default function ConfirmModal() {
  const { confirmDialog, closeConfirm } = useUiStore();
  const [submitting, setSubmitting] = useState(false);

  if (!confirmDialog.isOpen) return null;

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      if (confirmDialog.onConfirm) {
        await confirmDialog.onConfirm();
      }
      closeConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1060 }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content border-0 shadow">
          <div className={`modal-header bg-${confirmDialog.variant} text-white`}>
            <h5 className="modal-title">
              <i className="bi bi-exclamation-octagon me-2" />
              {confirmDialog.title}
            </h5>
            <button type="button" className="btn-close btn-close-white" onClick={closeConfirm} />
          </div>
          <div className="modal-body py-4">
            <p className="mb-0">{confirmDialog.message}</p>
          </div>
          <div className="modal-footer bg-light">
            <button type="button" className="btn btn-secondary" onClick={closeConfirm} disabled={submitting}>
              取消
            </button>
            <button
              type="button"
              className={`btn btn-${confirmDialog.variant}`}
              onClick={handleConfirm}
              disabled={submitting}
            >
              {submitting ? '處理中...' : confirmDialog.confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
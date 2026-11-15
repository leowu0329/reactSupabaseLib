// src/components/ToastContainer.jsx
import React from 'react';
import { useUiStore } from '../store/useUiStore';

export default function ToastContainer() {
  const { toasts, removeToast } = useUiStore();

  return (
    <div className="toast-container position-fixed top-0 end-0 p-3" style={{ zIndex: 1080 }}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="alert"
          className={`toast show align-items-center text-bg-${toast.type} border-0 mb-2 shadow`}
        >
          <div className="d-flex">
            <div className="toast-body">{toast.message}</div>
            <button
              type="button"
              className="btn-close btn-close-white me-2 m-auto"
              onClick={() => removeToast(toast.id)}
              aria-label="關閉通知"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
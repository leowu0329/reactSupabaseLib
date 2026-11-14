import React, { useEffect, useRef } from 'react';
import { Modal } from 'bootstrap';

export default function AppModal({ show, title, message, type = 'info', onClose, onConfirm }) {
  const modalRef = useRef(null);
  const bsModalInstance = useRef(null);

  useEffect(() => {
    if (modalRef.current) {
      bsModalInstance.current = new Modal(modalRef.current, { backdrop: 'static' });
    }
    return () => {
      bsModalInstance.current?.dispose();
    };
  }, []);

  useEffect(() => {
    if (show) {
      bsModalInstance.current?.show();
    } else {
      bsModalInstance.current?.hide();
    }
  }, [show]);

  const iconMap = {
    success: <i className="fa-solid fa-circle-check text-success me-2"></i>,
    danger: <i className="fa-solid fa-circle-exclamation text-danger me-2"></i>,
    warning: <i className="fa-solid fa-triangle-exclamation text-warning me-2"></i>,
    info: <i className="fa-solid fa-circle-info text-primary me-2"></i>,
  };

  return (
    <div className="modal fade" ref={modalRef} tabIndex="-1" aria-hidden="true">
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content shadow">
          <div className="modal-header">
            <h5 className="modal-title fw-bold">
              {iconMap[type]}
              {title}
            </h5>
            <button type="button" className="btn-close" onClick={onClose} aria-label="Close"></button>
          </div>
          <div className="modal-body py-4">{message}</div>
          <div className="modal-footer">
            {onConfirm && (
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                取消
              </button>
            )}
            <button
              type="button"
              className={`btn btn-${type === 'danger' ? 'danger' : 'primary'}`}
              onClick={() => {
                if (onConfirm) onConfirm();
                onClose();
              }}
            >
              確定
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
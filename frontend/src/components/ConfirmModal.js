import React from 'react';
import './ConfirmModal.css';

const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message, confirmText, cancelText, isHost }) => {
  if (!isOpen) return null;

  return (
    <div className="confirm-modal-overlay" onClick={onClose}>
      <div className="confirm-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-modal-icon">
          <i className="fas fa-exclamation-triangle"></i>
        </div>
        <div className="confirm-modal-header">
          <h3>{title}</h3>
        </div>
        <div className="confirm-modal-body">
          <p>{message}</p>
          {isHost && (
            <div className="confirm-warning">
              <i className="fas fa-info-circle"></i>
              <span>As the host, leaving will end the meeting for everyone.</span>
            </div>
          )}
        </div>
        <div className="confirm-modal-footer">
          <button 
            type="button" 
            className="btn-cancel" 
            onClick={onClose}
          >
            {cancelText || 'Cancel'}
          </button>
          <button 
            type="button" 
            className="btn-confirm-danger" 
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            <i className="fas fa-sign-out-alt"></i>
            {confirmText || 'Leave'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;

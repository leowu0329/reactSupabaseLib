import React from 'react';
import {
  COPY_STATE_META,
  COPY_EVENTS,
  copyStateMachine,
} from '../config/copyStateMachine';

const EVENT_BUTTON_LABELS = {
  [COPY_EVENTS.REPORT_DAMAGE]: { label: '登記損壞維修', btnClass: 'btn-outline-warning' },
  [COPY_EVENTS.REPAIR_COMPLETE]: { label: '維修完成上架', btnClass: 'btn-outline-success' },
  [COPY_EVENTS.REPORT_LOST]: { label: '登記遺失', btnClass: 'btn-outline-danger' },
  [COPY_EVENTS.RECOVER_LOST]: { label: '遺失尋獲上架', btnClass: 'btn-outline-success' },
  [COPY_EVENTS.DISPOSE]: { label: '報廢除帳', btnClass: 'btn-outline-secondary' },
};

export default function CopyStateBadge({ status, showActions = false, onTriggerEvent }) {
  const normalized = copyStateMachine.normalize(status);
  const meta = COPY_STATE_META[normalized] || {
    label: status,
    badgeClass: 'bg-secondary',
    description: '',
  };

  const allowedEvents = Object.keys(copyStateMachine.getAllowedTransitions(normalized)).filter(
    (evt) => EVENT_BUTTON_LABELS[evt]
  );

  return (
    <div className="d-inline-flex align-items-center flex-wrap gap-2">
      <span className={`badge ${meta.badgeClass}`} title={meta.description}>
        {meta.label}
      </span>

      {showActions &&
        allowedEvents.map((eventKey) => {
          const cfg = EVENT_BUTTON_LABELS[eventKey];
          return (
            <button
              key={eventKey}
              type="button"
              className={`btn btn-sm ${cfg.btnClass}`}
              onClick={() => onTriggerEvent?.(eventKey)}
            >
              {cfg.label}
            </button>
          );
        })}
    </div>
  );
}
/**
 * 館藏副本狀態機配置 (Copy State Machine)
 * 定義館藏副本的合法生命週期狀態與允許的事件轉移
 */

export const COPY_STATES = {
  AVAILABLE: 'available',       // 可借閱
  CHECKED_OUT: 'checked_out',   // 已借出
  RESERVED: 'reserved',         // 已預約（保留中）
  IN_TRANSIT: 'in_transit',     // 調撥中
  MAINTENANCE: 'maintenance',   // 修補中
  LOST: 'lost',                 // 已遺失
  DISCARDED: 'discarded',       // 已報廢（終態）
};

export const COPY_EVENTS = {
  CHECKOUT: 'CHECKOUT',
  CHECKIN: 'CHECKIN',
  RESERVE: 'RESERVE',
  CANCEL_RESERVE: 'CANCEL_RESERVE',
  TRANSFER: 'TRANSFER',
  ARRIVE: 'ARRIVE',
  SEND_MAINTENANCE: 'SEND_MAINTENANCE',
  FINISH_MAINTENANCE: 'FINISH_MAINTENANCE',
  REPORT_LOST: 'REPORT_LOST',
  FOUND: 'FOUND',
  DISCARD: 'DISCARD',
};

export const ALLOWED_TRANSITIONS = {
  [COPY_STATES.AVAILABLE]: {
    [COPY_EVENTS.CHECKOUT]: COPY_STATES.CHECKED_OUT,
    [COPY_EVENTS.RESERVE]: COPY_STATES.RESERVED,
    [COPY_EVENTS.TRANSFER]: COPY_STATES.IN_TRANSIT,
    [COPY_EVENTS.SEND_MAINTENANCE]: COPY_STATES.MAINTENANCE,
    [COPY_EVENTS.REPORT_LOST]: COPY_STATES.LOST,
    [COPY_EVENTS.DISCARD]: COPY_STATES.DISCARDED,
  },
  [COPY_STATES.CHECKED_OUT]: {
    [COPY_EVENTS.CHECKIN]: COPY_STATES.AVAILABLE,
    [COPY_EVENTS.REPORT_LOST]: COPY_STATES.LOST,
  },
  [COPY_STATES.RESERVED]: {
    [COPY_EVENTS.CHECKOUT]: COPY_STATES.CHECKED_OUT,
    [COPY_EVENTS.CANCEL_RESERVE]: COPY_STATES.AVAILABLE,
    [COPY_EVENTS.REPORT_LOST]: COPY_STATES.LOST,
  },
  [COPY_STATES.IN_TRANSIT]: {
    [COPY_EVENTS.ARRIVE]: COPY_STATES.AVAILABLE,
    [COPY_EVENTS.REPORT_LOST]: COPY_STATES.LOST,
  },
  [COPY_STATES.MAINTENANCE]: {
    [COPY_EVENTS.FINISH_MAINTENANCE]: COPY_STATES.AVAILABLE,
    [COPY_EVENTS.DISCARD]: COPY_STATES.DISCARDED,
  },
  [COPY_STATES.LOST]: {
    [COPY_EVENTS.FOUND]: COPY_STATES.AVAILABLE,
    [COPY_EVENTS.DISCARD]: COPY_STATES.DISCARDED,
  },
  [COPY_STATES.DISCARDED]: {
    // 報廢為不可逆終態，不允許任何轉移
  },
};

/**
 * 執行館藏狀態轉移並驗證合法性
 * @param {string} currentState 目前狀態
 * @param {string} event 觸發事件
 * @returns {string} 轉移後的新狀態
 */
export function transitionCopyState(currentState, event) {
  const normalizedState = String(currentState || '').toLowerCase();
  const normalizedEvent = String(event || '').toUpperCase();

  const stateTransitions = ALLOWED_TRANSITIONS[normalizedState];
  if (!stateTransitions) {
    throw new Error(`無效的館藏狀態: ${currentState}`);
  }

  const nextState = stateTransitions[normalizedEvent];
  if (!nextState) {
    throw new Error(`館藏目前狀態「${normalizedState}」不允許執行「${normalizedEvent}」操作`);
  }

  return nextState;
}

/**
 * 檢查特定操作是否合法
 */
export function canTransition(currentState, event) {
  try {
    transitionCopyState(currentState, event);
    return true;
  } catch {
    return false;
  }
}

export default {
  COPY_STATES,
  COPY_EVENTS,
  ALLOWED_TRANSITIONS,
  transitionCopyState,
  canTransition,
};
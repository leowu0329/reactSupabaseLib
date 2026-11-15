/**
 * 館藏副本有限狀態機 (Finite State Machine) 與異常代碼定義
 */

export const COPY_STATES = Object.freeze({
  AVAILABLE: 'available',       // 在館
  BORROWED: 'borrowed',         // 借出
  RESERVED: 'reserved',         // 預約保留
  MAINTENANCE: 'maintenance',   // 維修中
  LOST: 'lost',                 // 遺失
  DISPOSED: 'disposed',         // 報廢（終態）
});

export const COPY_STATE_META = Object.freeze({
  [COPY_STATES.AVAILABLE]: {
    label: '在館 (Available)',
    badgeClass: 'bg-success',
    description: '可正常提供外借與預約分配',
  },
  [COPY_STATES.BORROWED]: {
    label: '借出 (Borrowed)',
    badgeClass: 'bg-primary',
    description: '已由讀者借出館外，等待歸還',
  },
  [COPY_STATES.RESERVED]: {
    label: '預約保留 (Reserved)',
    badgeClass: 'bg-warning text-dark',
    description: '已為候補第一順位讀者保留，僅限該讀者取書借閱',
  },
  [COPY_STATES.MAINTENANCE]: {
    label: '維修中 (Maintenance)',
    badgeClass: 'bg-info text-dark',
    description: '書籍損壞修補或裝訂處理中，暫停借閱',
  },
  [COPY_STATES.LOST]: {
    label: '遺失 (Lost)',
    badgeClass: 'bg-danger',
    description: '讀者或館內盤點通報遺失，保留賠償與追蹤紀錄',
  },
  [COPY_STATES.DISPOSED]: {
    label: '報廢 (Disposed)',
    badgeClass: 'bg-secondary',
    description: '嚴重損毀或確認遺失無法找回，已註銷除帳（終態）',
  },
});

export const COPY_EVENTS = Object.freeze({
  BORROW: 'BORROW',                   // 借出
  RETURN: 'RETURN',                   // 歸還（在館）
  HOLD_FOR_RESERVE: 'HOLD_FOR_RESERVE', // 預約保留
  CANCEL_RESERVE: 'CANCEL_RESERVE',   // 取消/逾期釋放保留
  REPORT_DAMAGE: 'REPORT_DAMAGE',     // 通報損壞進入維修
  REPAIR_COMPLETE: 'REPAIR_COMPLETE', // 維修完成重新上架
  REPORT_LOST: 'REPORT_LOST',         // 通報遺失
  RECOVER_LOST: 'RECOVER_LOST',       // 遺失尋獲重新上架
  DISPOSE: 'DISPOSE',                 // 報廢除帳
});

/**
 * 狀態機轉換表 (Transition Table)
 * 結構：{ [當前狀態]: { [觸發事件]: 目標狀態 } }
 */
export const STATE_TRANSITIONS = Object.freeze({
  [COPY_STATES.AVAILABLE]: {
    [COPY_EVENTS.BORROW]: COPY_STATES.BORROWED,
    [COPY_EVENTS.HOLD_FOR_RESERVE]: COPY_STATES.RESERVED,
    [COPY_EVENTS.REPORT_DAMAGE]: COPY_STATES.MAINTENANCE,
    [COPY_EVENTS.REPORT_LOST]: COPY_STATES.LOST,
    [COPY_EVENTS.DISPOSE]: COPY_STATES.DISPOSED,
  },
  [COPY_STATES.BORROWED]: {
    [COPY_EVENTS.RETURN]: COPY_STATES.AVAILABLE,
    [COPY_EVENTS.HOLD_FOR_RESERVE]: COPY_STATES.RESERVED,
    [COPY_EVENTS.REPORT_DAMAGE]: COPY_STATES.MAINTENANCE,
    [COPY_EVENTS.REPORT_LOST]: COPY_STATES.LOST,
  },
  [COPY_STATES.RESERVED]: {
    [COPY_EVENTS.BORROW]: COPY_STATES.BORROWED,
    [COPY_EVENTS.CANCEL_RESERVE]: COPY_STATES.AVAILABLE,
    [COPY_EVENTS.REPORT_DAMAGE]: COPY_STATES.MAINTENANCE,
    [COPY_EVENTS.REPORT_LOST]: COPY_STATES.LOST,
  },
  [COPY_STATES.MAINTENANCE]: {
    [COPY_EVENTS.REPAIR_COMPLETE]: COPY_STATES.AVAILABLE,
    [COPY_EVENTS.DISPOSE]: COPY_STATES.DISPOSED,
  },
  [COPY_STATES.LOST]: {
    [COPY_EVENTS.RECOVER_LOST]: COPY_STATES.AVAILABLE,
    [COPY_EVENTS.DISPOSE]: COPY_STATES.DISPOSED,
  },
  [COPY_STATES.DISPOSED]: {
    // 報廢為不可逆終態，無任何允許的轉換事件
  },
});

/**
 * 標準化業務異常類別
 */
export class LibraryBusinessError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'LibraryBusinessError';
    this.code = code;
    this.details = details;
  }
}

/**
 * 館藏狀態機引擎：驗證並計算下一個合法狀態
 */
export const copyStateMachine = {
  normalize(state) {
    return String(state || '').trim().toLowerCase();
  },

  /**
   * 取得當前狀態允許執行的所有事件與目標狀態
   */
  getAllowedTransitions(currentState) {
    const normalized = this.normalize(currentState);
    return STATE_TRANSITIONS[normalized] || {};
  },

  /**
   * 檢查是否允許從 currentState 轉換至 targetState
   */
  canTransitionTo(currentState, targetState) {
    const from = this.normalize(currentState);
    const to = this.normalize(targetState);
    const allowedMap = this.getAllowedTransitions(from);
    return Object.values(allowedMap).includes(to);
  },

  /**
   * 透過事件執行狀態轉換計算（不合法時直接拋出 LibraryBusinessError）
   */
  transitionByEvent(currentState, eventName) {
    const from = this.normalize(currentState);
    const allowedMap = this.getAllowedTransitions(from);

    if (!allowedMap || !(eventName in allowedMap)) {
      throw new LibraryBusinessError(
        'INVALID_STATE_TRANSITION',
        `館藏狀態機阻擋：處於「${COPY_STATE_META[from]?.label || from}」的書籍不可執行「${eventName}」操作`,
        { fromState: from, eventName, allowedEvents: Object.keys(allowedMap || {}) }
      );
    }

    return allowedMap[eventName];
  },

  /**
   * 直接指定目標狀態的合法性校驗
   */
  assertValidTargetState(currentState, targetState) {
    const from = this.normalize(currentState);
    const to = this.normalize(targetState);

    if (!COPY_STATE_META[to]) {
      throw new LibraryBusinessError('UNKNOWN_COPY_STATE', `未知的館藏狀態：${targetState}`);
    }

    if (from === to) return to;

    if (!this.canTransitionTo(from, to)) {
      throw new LibraryBusinessError(
        'INVALID_STATE_TRANSITION',
        `非法狀態轉換：不允許將館藏從「${COPY_STATE_META[from]?.label || from}」直接修改為「${COPY_STATE_META[to]?.label || to}」`,
        { fromState: from, toState: to }
      );
    }

    return to;
  },
};
// src/lib/roadmapService.js
import { supabase } from './supabase.js';

export const LMS_ROADMAP_PHASES = [
  {
    id: 'phase-1',
    phaseNumber: 1,
    title: 'Phase 1：需求分析與系統規劃',
    category: '基礎階段',
    deliverables: ['系統需求文件（SRS）', '使用者角色與權限矩陣', '系統架構圖', '業務流程圖', 'ERD 資料庫設計'],
    tables: ['roles', 'permissions'],
  },
  {
    id: 'phase-2',
    phaseNumber: 2,
    title: 'Phase 2：基礎系統建置',
    category: '基礎架構與驗證',
    deliverables: ['Vite + React/Vue3 鷹架', '狀態管理與路由守衛', 'Supabase 專案連線', '登入、註冊、Email 驗證', 'RBAC 權限系統'],
    tables: ['profiles', 'user_roles'],
  },
  {
    id: 'phase-3',
    phaseNumber: 3,
    title: 'Phase 3：圖書與讀者管理',
    category: '主檔資料管理',
    deliverables: ['書目 CRUD', '館藏副本管理', '作者、出版社、分類', '讀者 CRUD', '條碼管理'],
    tables: ['books', 'book_copies', 'authors', 'publishers', 'categories', 'members'],
  },
  {
    id: 'phase-4',
    phaseNumber: 4,
    title: 'Phase 4：借閱核心功能',
    category: '流通核心引擎',
    deliverables: ['借閱作業', '歸還作業', '續借作業', '借閱期限計算', '借閱冊數與資格限制'],
    tables: ['borrow_records'],
  },
  {
    id: 'phase-5',
    phaseNumber: 5,
    title: 'Phase 5：進階業務功能',
    category: '加值與帳務流程',
    deliverables: ['預約與候補佇列', '逾期天數及罰款計算', '罰款繳費銷帳', '即時通知中心'],
    tables: ['reservations', 'fines', 'notifications'],
  },
  {
    id: 'phase-6',
    phaseNumber: 6,
    title: 'Phase 6：館務管理',
    category: '後勤與多分館維運',
    deliverables: ['圖書採購單', '館藏盤點作業', '遺失及報廢處理', '多分館館藏調撥'],
    tables: ['acquisitions', 'inventory_audits', 'branches'],
  },
  {
    id: 'phase-7',
    phaseNumber: 7,
    title: 'Phase 7：Dashboard 與報表',
    category: '決策分析與匯出',
    deliverables: ['借閱趨勢統計', '館藏利用率分析', '讀者活躍度分析', 'Excel / PDF 報表匯出'],
    tables: ['audit_logs'],
  },
  {
    id: 'phase-8',
    phaseNumber: 8,
    title: 'Phase 8：測試與正式部署',
    category: '品質保證與上線',
    deliverables: ['單元測試', '整合測試', 'RBAC 權限測試', '效能壓力測試', 'RLS 安全性測試', '正式環境部署'],
    tables: [],
  },
];

/**
 * 獨立驗證單一開發階段的後端資料表可達性與業務邏輯健康度
 * @param {number} phaseNumber 1 ~ 8
 * @param {object} client 可傳入自訂或 Mock Supabase Client 以支援測試隔離
 */
export async function verifyPhaseReadiness(phaseNumber, client = supabase) {
  const phase = LMS_ROADMAP_PHASES.find((p) => p.phaseNumber === phaseNumber);
  if (!phase) {
    throw new Error(`無效的開發階段編號: ${phaseNumber}`);
  }

  const tableChecks = [];
  for (const tableName of phase.tables) {
    try {
      const { error } = await client.from(tableName).select('id').limit(1);
      tableChecks.push({
        table: tableName,
        accessible: !error,
        message: error ? error.message : 'OK',
      });
    } catch (err) {
      tableChecks.push({
        table: tableName,
        accessible: false,
        message: err.message,
      });
    }
  }

  const allTablesReady = tableChecks.every((t) => t.accessible);
  return {
    phaseNumber: phase.phaseNumber,
    title: phase.title,
    status: allTablesReady ? 'READY' : 'DEGRADED',
    deliverablesCount: phase.deliverables.length,
    tableChecks,
    verifiedAt: new Date().toISOString(),
  };
}

/**
 * 計算整體專案 Roadmap 推進進度
 */
export function calculateRoadmapProgress(completedPhaseNumbers = []) {
  const uniqueCompleted = [...new Set(completedPhaseNumbers)].filter(
    (num) => num >= 1 && num <= LMS_ROADMAP_PHASES.length
  );
  const percentage = Math.round((uniqueCompleted.length / LMS_ROADMAP_PHASES.length) * 100);
  const nextPhase = LMS_ROADMAP_PHASES.find((p) => !uniqueCompleted.includes(p.phaseNumber)) || null;

  return {
    totalPhases: LMS_ROADMAP_PHASES.length,
    completedCount: uniqueCompleted.length,
    percentage,
    nextPhase: nextPhase ? { phaseNumber: nextPhase.phaseNumber, title: nextPhase.title } : null,
  };
}
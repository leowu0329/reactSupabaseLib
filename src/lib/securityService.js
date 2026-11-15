import { supabase } from './supabase.js';

/**
 * 1. XSS 跨站腳本攻擊防護：過濾危險 HTML 標籤與事件屬性
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * 2. 個資保護規範（最小權限顯示）：對敏感個資進行遮罩處理
 */
export function maskPersonalData(profile, viewerRole) {
  if (!profile) return null;
  // 僅管理員與本人可看完整資訊，一般館員檢視時進行部分遮罩
  if (viewerRole === 'admin') return profile;

  const maskEmail = (email) => {
    if (!email || !email.includes('@')) return '***';
    const [name, domain] = email.split('@');
    return `${name.slice(0, 2)}***@${domain}`;
  };

  const maskPhone = (phone) => {
    if (!phone || phone.length < 7) return '***';
    return `${phone.slice(0, 4)}-***-${phone.slice(-3)}`;
  };

  return {
    ...profile,
    email: maskEmail(profile.email),
    phone: maskPhone(profile.phone),
  };
}

/**
 * 3. 管理員重要操作稽核紀錄 (Audit Logs)
 */
export async function logAdminAction({ actorId, action, targetTable, targetId, details }, client = supabase) {
  if (!actorId || !action) {
    throw new Error('稽核日誌缺少必要欄位 (actorId 或 action)');
  }

  const sanitizedDetails = typeof details === 'string'
    ? sanitizeInput(details)
    : JSON.parse(sanitizeInput(JSON.stringify(details || {})));

  const { data, error } = await client
    .from('audit_logs')
    .insert([
      {
        actor_id: actorId,
        action,
        target_table: targetTable,
        target_id: targetId,
        details: sanitizedDetails,
        created_at: new Date().toISOString(),
      },
    ])
    .select()
    .single();

  if (error) {
    throw new Error(`寫入稽核日誌失敗: ${error.message}`);
  }
  return data;
}
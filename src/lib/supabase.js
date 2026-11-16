import { createClient } from '@supabase/supabase-js';

// 安全檢查：確保前端環境變數未誤植 Service Role Key
if (import.meta.env && Object.keys(import.meta.env).some((k) => k.includes('SERVICE_ROLE'))) {
  throw new Error('嚴重資安警告：偵測到前端環境變數包含 SERVICE_ROLE 金鑰，已強制中斷初始化！');
}

const isNodeTestEnv =
  typeof process !== 'undefined' &&
  (process.env.NODE_ENV === 'test' || process.execArgv?.some((arg) => arg.includes('--test')));

const supabaseUrl =
  import.meta.env?.VITE_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  (isNodeTestEnv ? 'http://127.0.0.1:54321' : '');

const supabaseAnonKey =
  import.meta.env?.VITE_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  (isNodeTestEnv ? 'test-anon-key-placeholder' : '');

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
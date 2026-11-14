/**
 * test/rbac.test.js
 * 前後端 RBAC 權限與操作稽核實際測試腳本
 * 執行方式：node --env-file=.env test/rbac.test.js
 */
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { ROLES, checkPermission } from '../src/config/permissions.js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const LIBRARIAN_EMAIL = process.env.TEST_LIBRARIAN_EMAIL || 'librarian@library.test';
const LIBRARIAN_PASSWORD = process.env.TEST_LIBRARIAN_PASSWORD || 'TestPass123!';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ 缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_ANON_KEY 環境變數');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runTests() {
  console.log('====================================================');
  console.log('🧪 開始執行圖書館系統 RBAC 前後端整合測試');
  console.log('====================================================\n');

  // ----------------------------------------------------------------
  // 第一部分：前端權限矩陣與元件邏輯驗證
  // ----------------------------------------------------------------
  console.log('▶ [測試 1] 前端角色權限矩陣 (Librarian) 驗證...');
  assert.equal(checkPermission(ROLES.LIBRARIAN, 'book.read'), true, 'Librarian 應可讀取書籍');
  assert.equal(checkPermission(ROLES.LIBRARIAN, 'book.create'), true, 'Librarian 應可新增書籍');
  assert.equal(checkPermission(ROLES.LIBRARIAN, 'book.update'), true, 'Librarian 應可更新書籍');
  assert.equal(checkPermission(ROLES.LIBRARIAN, 'book.delete'), false, 'Librarian 不可刪除書籍');

  assert.equal(checkPermission(ROLES.LIBRARIAN, 'borrow.create'), true, 'Librarian 應可建立借閱');
  assert.equal(checkPermission(ROLES.LIBRARIAN, 'borrow.return'), true, 'Librarian 應可辦理歸還');
  assert.equal(checkPermission(ROLES.LIBRARIAN, 'borrow.approve'), true, 'Librarian 應可審核借閱');
  assert.equal(checkPermission(ROLES.LIBRARIAN, 'system.settings'), false, 'Librarian 不可修改系統設定');
  console.log('✅ 前端權限規則驗證完全通過！\n');

  // ----------------------------------------------------------------
  // 第二部分：後端 Supabase API 與 RLS 實際操作驗證
  // ----------------------------------------------------------------
  console.log('▶ [測試 2] 訪客 (Guest / 未登入) 後端 API 操作測試...');
  const { error: guestReadErr } = await supabase.from('books').select('id, title').limit(1);
  assert.equal(guestReadErr, null, '訪客應可查詢公開書目');

  const { error: guestInsertErr } = await supabase
    .from('books')
    .insert([{
      title: '未授權訪客測試書',
      author: 'Hacker',
      isbn: '978-0-00-000000-0',
      category: '測試分類',
    }]);
  assert.notEqual(guestInsertErr, null, '後端 RLS 必須阻擋訪客新增書籍');
  console.log(`✅ 訪客查詢放行，新增書籍已被後端 RLS 攔截 (${guestInsertErr.code})\n`);

  console.log(`▶ [測試 3] 登入圖書館員帳號 (${LIBRARIAN_EMAIL}) 進行後端實測...`);
  const { data: authData, error: loginErr } = await supabase.auth.signInWithPassword({
    email: LIBRARIAN_EMAIL,
    password: LIBRARIAN_PASSWORD,
  });

  if (loginErr) {
    console.warn(`⚠️ 跳過需真實登入的後端測試：${loginErr.message}`);
    return;
  }

  assert.ok(authData.user, 'Librarian 登入成功');

  // 3-1. 測試 book.create = true (補齊 title, author, isbn, category, available)
  const uniqueSuffix = Date.now();
  const testBookTitle = `RBAC自動測試書籍_${uniqueSuffix}`;
  const testBookIsbn = `978-986-${String(uniqueSuffix).slice(-6)}-1`;

  const { data: createdBook, error: createErr } = await supabase
    .from('books')
    .insert([{
      title: testBookTitle,
      author: '系統測試員',
      isbn: testBookIsbn,
      category: '程式設計',
      available: true,
    }])
    .select()
    .single();
  assert.equal(createErr, null, 'Librarian 新增書籍應成功');
  assert.equal(createdBook.title, testBookTitle);
  console.log(`   ✔ [book.create = true] 成功新增書籍 ID: ${createdBook.id} (ISBN: ${testBookIsbn})`);

  // 3-2. 測試 book.update = true
  const { data: updatedBook, error: updateErr } = await supabase
    .from('books')
    .update({ available: false })
    .eq('id', createdBook.id)
    .select()
    .single();
  assert.equal(updateErr, null, 'Librarian 更新書籍應成功');
  assert.equal(updatedBook.available, false);
  console.log(`   ✔ [book.update = true] 成功更新書籍狀態為已借出`);

  // 3-3. 測試 book.delete = false (即使繞過前端直接呼叫 delete API 也必須被擋下)
  const { data: deletedRows, error: deleteErr } = await supabase
    .from('books')
    .delete()
    .eq('id', createdBook.id)
    .select();
  const isDeleteBlocked = Boolean(deleteErr) || (Array.isArray(deletedRows) && deletedRows.length === 0);
  assert.equal(isDeleteBlocked, true, '後端 RLS 必須阻擋 Librarian 刪除書籍');
  console.log(`   ✔ [book.delete = false] 越權刪除書籍已被後端 RLS 成功阻擋`);

  // 3-4. 測試 system.settings = false
  const { data: settingRows, error: settingErr } = await supabase
    .from('system_settings')
    .update({ value: { days: 999 } })
    .eq('key', 'max_borrow_days')
    .select();
  const isSettingBlocked = Boolean(settingErr) || (Array.isArray(settingRows) && settingRows.length === 0);
  assert.equal(isSettingBlocked, true, '後端 RLS 必須阻擋 Librarian 修改系統設定');
  console.log(`   ✔ [system.settings = false] 越權修改系統設定已被後端 RLS 成功阻擋`);

  await supabase.auth.signOut();
  console.log('\n🎉 所有前後端 RBAC 權限與安全政策測試皆已通過！');
}

runTests().catch((err) => {
  console.error('\n❌ 測試失敗：', err);
  process.exit(1);
});
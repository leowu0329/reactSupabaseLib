import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY?.trim();
const cloudName = process.env.VITE_CLOUDINARY_CLOUD_NAME?.trim();
const uploadPreset = process.env.VITE_CLOUDINARY_UPLOAD_PRESET?.trim();

console.log('====================================');
console.log('🔍 開始執行外部服務連線測試...');
console.log('====================================\n');

// 1. 檢查環境變數與格式
function checkEnvVariables() {
  const missing = [];
  if (!supabaseUrl) missing.push('VITE_SUPABASE_URL');
  if (!supabaseKey) missing.push('VITE_SUPABASE_ANON_KEY');
  if (!cloudName) missing.push('VITE_CLOUDINARY_CLOUD_NAME');
  if (!uploadPreset) missing.push('VITE_CLOUDINARY_UPLOAD_PRESET');

  if (missing.length > 0) {
    throw new Error(`❌ .env 檔案缺少以下環境變數：${missing.join(', ')}`);
  }

  if (!supabaseUrl.startsWith('https://') || !supabaseUrl.includes('.supabase.co')) {
    throw new Error(
      `❌ VITE_SUPABASE_URL 格式異常（目前為 "${supabaseUrl}"），正確格式應為 https://xxxxx.supabase.co`
    );
  }

  console.log(`✅ [1/3] 環境變數檢查通過 (URL: ${supabaseUrl})`);
}

// 2. 測試 Supabase 資料庫連線（移除 head: true 以獲取完整錯誤訊息）
async function testSupabase() {
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error, status, statusText } = await supabase
    .from('books')
    .select('id')
    .limit(1);

  if (error) {
    console.error('📋 Supabase 完整錯誤詳情：', {
      status,
      statusText,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(`❌ Supabase 連線或查詢失敗 (HTTP ${status} ${statusText})`);
  }

  console.log(`✅ [2/3] Supabase 連線成功！(HTTP ${status}，成功讀取 books 資料表)`);
}

// 3. 測試 Cloudinary 圖片上傳 API
async function testCloudinary() {
  const dummyPngBase64 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  const formData = new FormData();
  formData.append('file', dummyPngBase64);
  formData.append('upload_preset', uploadPreset);
  formData.append('folder', 'library_connection_test');

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    {
      method: 'POST',
      body: formData,
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(`❌ Cloudinary 上傳失敗：${result.error?.message || response.statusText}`);
  }

  console.log('✅ [3/3] Cloudinary 連線與上傳成功！');
  console.log(`   👉 測試圖片網址：${result.secure_url}`);
}

async function runAllTests() {
  try {
    checkEnvVariables();
    await testSupabase();
    await testCloudinary();
    console.log('\n🎉 所有服務連線皆正常，可以開始啟動專案！');
  } catch (err) {
    console.error(`\n${err.message}`);
    process.exit(1);
  }
}

runAllTests();
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import AppModal from '../components/AppModal';

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [modal, setModal] = useState({ show: false, title: '', message: '', type: 'info' });
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isRegister) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) {
        setModal({ show: true, title: '註冊失敗', message: error.message, type: 'danger' });
      } else {
        setModal({
          show: true,
          title: '註冊成功',
          message: '請前往信箱點擊驗證連結（若已在 Supabase 關閉信箱驗證則可直接登入）。',
          type: 'success',
        });
        setIsRegister(false);
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setModal({ show: true, title: '登入失敗', message: error.message, type: 'danger' });
      } else {
        navigate('/');
      }
    }
  };

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-md-5">
          <div className="card shadow border-0">
            <div className="card-body p-4">
              <h3 className="text-center fw-bold mb-4">
                <i className="fa-solid fa-book-bookmark text-primary me-2"></i>
                {isRegister ? '註冊讀者帳號' : '圖書館系統登入'}
              </h3>
              <form onSubmit={handleSubmit}>
                {isRegister && (
                  <div className="mb-3">
                    <label className="form-label">姓名</label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
                )}
                <div className="mb-3">
                  <label className="form-label">電子信箱</label>
                  <input
                    type="email"
                    className="form-control"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="mb-4">
                  <label className="form-label">密碼</label>
                  <input
                    type="password"
                    className="form-control"
                    required
                    minLength="6"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn btn-primary w-100 fw-bold">
                  {isRegister ? '建立帳號' : '登入系統'}
                </button>
              </form>
              <div className="text-center mt-3">
                <button
                  type="button"
                  className="btn btn-link text-decoration-none small"
                  onClick={() => setIsRegister(!isRegister)}
                >
                  {isRegister ? '已有帳號？返回登入' : '尚未註冊？建立新讀者帳號'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <AppModal {...modal} onClose={() => setModal({ ...modal, show: false })} />
    </div>
  );
}
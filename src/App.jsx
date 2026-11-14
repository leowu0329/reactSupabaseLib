import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { useLibraryStore } from './store/useLibraryStore';
import { realtimeService } from './lib/realtimeService';
import ProtectedRoute from './routes/ProtectedRoute';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import MyBorrows from './pages/MyBorrows';
import AdminDashboard from './pages/AdminDashboard';
import Login from './pages/Login';

export default function App() {
  const user = useLibraryStore((state) => state.user);
  const authLoading = useLibraryStore((state) => state.authLoading);
  const syncAuthSession = useLibraryStore((state) => state.syncAuthSession);
  const fetchBooks = useLibraryStore((state) => state.fetchBooks);
  const pushNotification = useLibraryStore((state) => state.pushNotification);

  useEffect(() => {
    // 1. 初始化認證 Session
    supabase.auth.getSession().then(({ data: { session } }) => {
      syncAuthSession(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      syncAuthSession(session?.user ?? null);
    });

    // 2. 啟動 Supabase Realtime 館藏異動即時通知
    const copyChannel = realtimeService.subscribeCopyStatus((newCopy, oldCopy) => {
      if (newCopy?.status !== oldCopy?.status) {
        pushNotification({
          title: '館藏狀態即時更新',
          message: `條碼 ${newCopy.barcode} 狀態已變更為：${newCopy.status}`,
        });
        fetchBooks().catch(() => {});
      }
    });

    return () => {
      subscription.unsubscribe();
      realtimeService.unsubscribe(copyChannel);
    };
  }, [syncAuthSession, fetchBooks, pushNotification]);

  if (authLoading) return null;

  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home user={user} />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/my-borrows"
          element={
            <ProtectedRoute>
              <MyBorrows user={user} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute requiredPermission="borrow.approve">
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
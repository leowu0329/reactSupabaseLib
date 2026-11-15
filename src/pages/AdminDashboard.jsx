import React, { useEffect, useState } from 'react';
import { analyticsService } from '../lib/analyticsService';

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMetrics = async () => {
    setLoading(true);
    try {
      const data = await analyticsService.getDashboardMetrics();
      setMetrics(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
  }, []);

  if (loading || !metrics) return <div className="p-4">載入營運統計數據中...</div>;

  const kpiCards = [
    { label: '圖書總數', value: metrics.totalBooks, color: 'primary' },
    { label: '可借閱數量', value: metrics.availableBooks, color: 'success' },
    { label: '借出數量', value: metrics.borrowedBooks, color: 'info' },
    { label: '館藏使用率', value: `${metrics.utilizationRate}%`, color: 'dark' },
    { label: '今日借閱量', value: metrics.todayBorrows, color: 'primary' },
    { label: '今日歸還量', value: metrics.todayReturns, color: 'success' },
    { label: '逾期未還數量', value: metrics.overdueCount, color: 'danger' },
    { label: '預約等待數量', value: metrics.waitingReservations, color: 'warning' }
  ];

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="fw-bold">圖書館營運統計分析 Dashboard</h2>
        <button className="btn btn-outline-primary btn-sm" onClick={loadMetrics}>
          重新整理數據
        </button>
      </div>

      {/* 8 項即時 KPI 卡片 */}
      <div className="row g-3 mb-4">
        {kpiCards.map((kpi, idx) => (
          <div key={idx} className="col-6 col-md-3">
            <div className={`card border-${kpi.color} shadow-sm h-100`}>
              <div className="card-body">
                <div className="text-muted small">{kpi.label}</div>
                <div className={`fs-3 fw-bold text-${kpi.color}`}>{kpi.value}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 4 項深度排行榜與趨勢分析 */}
      <div className="row g-4">
        <div className="col-md-6">
          <div className="card shadow-sm h-100">
            <div className="card-header fw-bold">熱門書籍排行榜 (Top 5)</div>
            <ul className="list-group list-group-flush">
              {metrics.topBooks.map((b, i) => (
                <li key={i} className="list-group-item d-flex justify-content-between">
                  <span>#{i + 1} {b.name}</span>
                  <span className="badge bg-primary rounded-pill">{b.count} 次</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="col-md-6">
          <div className="card shadow-sm h-100">
            <div className="card-header fw-bold">熱門分類分析</div>
            <ul className="list-group list-group-flush">
              {metrics.topCategories.map((c, i) => (
                <li key={i} className="list-group-item d-flex justify-content-between">
                  <span>{c.name}</span>
                  <span className="badge bg-success rounded-pill">{c.count} 冊</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="col-md-6">
          <div className="card shadow-sm h-100">
            <div className="card-header fw-bold">讀者借閱排行</div>
            <ul className="list-group list-group-flush">
              {metrics.topReaders.map((r, i) => (
                <li key={i} className="list-group-item d-flex justify-content-between">
                  <span>{r.name}</span>
                  <span className="badge bg-info text-dark rounded-pill">{r.count} 本</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="col-md-6">
          <div className="card shadow-sm h-100">
            <div className="card-header fw-bold">每月借閱趨勢</div>
            <ul className="list-group list-group-flush">
              {metrics.monthlyTrend.map((m, i) => (
                <li key={i} className="list-group-item d-flex justify-content-between">
                  <span>{m.month}</span>
                  <span className="fw-bold">{m.count} 筆借閱</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
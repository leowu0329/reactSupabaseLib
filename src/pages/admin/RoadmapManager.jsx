// src/pages/admin/RoadmapManager.jsx
import React, { useState } from 'react';
import {
  LMS_ROADMAP_PHASES,
  verifyPhaseReadiness,
  calculateRoadmapProgress,
} from '../../lib/roadmapService';

export default function RoadmapManager() {
  const [completedPhases, setCompletedPhases] = useState([1, 2, 3, 4]);
  const [verificationResults, setVerificationResults] = useState({});
  const [testingPhase, setTestingPhase] = useState(null);

  const progress = calculateRoadmapProgress(completedPhases);

  const togglePhaseComplete = (phaseNumber) => {
    setCompletedPhases((prev) =>
      prev.includes(phaseNumber)
        ? prev.filter((n) => n !== phaseNumber)
        : [...prev, phaseNumber].sort((a, b) => a - b)
    );
  };

  const handleRunPhaseTest = async (phaseNumber) => {
    setTestingPhase(phaseNumber);
    try {
      const result = await verifyPhaseReadiness(phaseNumber);
      setVerificationResults((prev) => ({ ...prev, [phaseNumber]: result }));
    } finally {
      setTestingPhase(null);
    }
  };

  return (
    <div className="container-fluid py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="fw-bold mb-1">LMS 分階段開發與專案管理看板</h2>
          <p className="text-muted mb-0">
            遵循敏捷增量交付原則：每個 Phase 皆具備獨立執行、獨立資料表驗證與自動化測試能力
          </p>
        </div>
        <div className="text-end">
          <span className="badge bg-primary fs-6">整體完成度：{progress.percentage}%</span>
          {progress.nextPhase && (
            <div className="small text-muted mt-1">
              下一里程碑：{progress.nextPhase.title}
            </div>
          )}
        </div>
      </div>

      <div className="progress mb-4" style={{ height: '12px' }}>
        <div
          className="progress-bar bg-success"
          role="progressbar"
          style={{ width: `${progress.percentage}%` }}
          aria-valuenow={progress.percentage}
          aria-valuemin="0"
          aria-valuemax="100"
        />
      </div>

      <div className="row g-3">
        {LMS_ROADMAP_PHASES.map((phase) => {
          const isDone = completedPhases.includes(phase.phaseNumber);
          const testResult = verificationResults[phase.phaseNumber];

          return (
            <div className="col-md-6 col-xl-4" key={phase.id}>
              <div className={`card h-100 shadow-sm ${isDone ? 'border-success' : 'border-secondary'}`}>
                <div className="card-header d-flex justify-content-between align-items-center">
                  <span className="badge bg-dark">{phase.category}</span>
                  <div className="form-check form-switch mb-0">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id={`check-${phase.id}`}
                      checked={isDone}
                      onChange={() => togglePhaseComplete(phase.phaseNumber)}
                    />
                    <label className="form-check-label small" htmlFor={`check-${phase.id}`}>
                      {isDone ? '已驗收' : '開發中'}
                    </label>
                  </div>
                </div>

                <div className="card-body">
                  <h5 className="card-title fw-bold">{phase.title}</h5>
                  <ul className="list-group list-group-flush small mb-3">
                    {phase.deliverables.map((item, idx) => (
                      <li className="list-group-item px-0 py-1" key={idx}>
                        <i className="bi bi-check2-circle text-success me-2" />
                        {item}
                      </li>
                    ))}
                  </ul>

                  {testResult && (
                    <div
                      className={`alert py-2 px-3 small mb-0 ${
                        testResult.status === 'READY' ? 'alert-success' : 'alert-warning'
                      }`}
                    >
                      <strong>驗證狀態：{testResult.status}</strong>
                      <div className="text-muted">驗證時間：{testResult.verifiedAt}</div>
                    </div>
                  )}
                </div>

                <div className="card-footer bg-transparent border-top-0 d-flex justify-content-between">
                  <small className="text-muted align-self-center">
                    關聯資料表：{phase.tables.length} 個
                  </small>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    disabled={testingPhase === phase.phaseNumber}
                    onClick={() => handleRunPhaseTest(phase.phaseNumber)}
                  >
                    {testingPhase === phase.phaseNumber ? '驗證中...' : '獨立執行測試'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
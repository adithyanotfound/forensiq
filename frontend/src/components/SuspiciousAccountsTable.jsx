import React from 'react';

function SuspiciousAccountsTable({ accounts }) {
    if (!accounts || accounts.length === 0) {
        return (
            <div style={{
                textAlign: 'center',
                padding: '3rem',
                background: 'var(--bg-primary)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-subtle)'
            }}>
                <h3 style={{ color: 'var(--accent-success)' }}>No Suspicious Accounts</h3>
                <p style={{ color: 'var(--text-tertiary)', marginTop: '0.5rem' }}>
                    No accounts were flagged as suspicious in this dataset.
                </p>
            </div>
        );
    }

    const getScoreColor = (score) => {
        if (score >= 80) return 'high';
        if (score >= 50) return 'medium';
        return 'low';
    };

    const getScoreTextColor = (score) => {
        if (score >= 80) return '#ff6b6b';
        if (score >= 50) return 'var(--accent-warning)';
        return 'var(--accent-success)';
    };

    const getPatternBadgeClass = (pattern) => {
        if (pattern.includes('cycle')) return 'badge--cycle';
        if (pattern.includes('fan_in') && pattern.includes('fan_out')) return 'badge--fan-in-fan-out';
        if (pattern.includes('fan_in')) return 'badge--fan-in';
        if (pattern.includes('fan_out')) return 'badge--fan-out';
        if (pattern.includes('shell')) return 'badge--shell';
        if (pattern.includes('velocity')) return 'badge--fan-in';
        return 'badge--cycle';
    };

    return (
        <div className="table-wrapper">
            <div className="table-wrapper__title">
                Suspicious Accounts
                <span className="table-wrapper__count">
                    {accounts.length} flagged
                </span>
            </div>

            <div className="table-container" id="suspicious-accounts-table">
                <table className="table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Account ID</th>
                            <th>Suspicion Score</th>
                            <th>Detected Patterns</th>
                            <th>Ring ID</th>
                        </tr>
                    </thead>
                    <tbody>
                        {accounts.map((acc, idx) => (
                            <tr key={acc.account_id}>
                                <td style={{ color: 'var(--text-tertiary)' }}>{idx + 1}</td>
                                <td>
                                    <span className="cell-mono">{acc.account_id}</span>
                                </td>
                                <td>
                                    <div className="cell-score">
                                        <span className="cell-mono" style={{ color: getScoreTextColor(acc.suspicion_score) }}>
                                            {acc.suspicion_score}
                                        </span>
                                        <div className="score-bar">
                                            <div
                                                className={`score-bar__fill score-bar__fill--${getScoreColor(acc.suspicion_score)}`}
                                                style={{ width: `${acc.suspicion_score}%` }}
                                            />
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                        {acc.detected_patterns.map((pattern, pidx) => (
                                            <span key={pidx} className={`badge ${getPatternBadgeClass(pattern)}`}>
                                                {pattern}
                                            </span>
                                        ))}
                                    </div>
                                </td>
                                <td>
                                    <span className="cell-mono">{acc.ring_id}</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default SuspiciousAccountsTable;

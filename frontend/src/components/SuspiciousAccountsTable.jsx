import React, { useState } from 'react';

function SuspiciousAccountsTable({ accounts }) {
    const [expandedAccount, setExpandedAccount] = useState(null);

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

    const getSuspicionLabelStyle = (label) => {
        switch (label) {
            case 'High Risk': return { color: '#ff4757', fontWeight: 700 };
            case 'Suspicious': return { color: '#ff6b6b', fontWeight: 600 };
            case 'Monitor': return { color: 'var(--accent-warning)', fontWeight: 600 };
            case 'Stable / Merchant': return { color: 'var(--accent-success)', fontWeight: 500 };
            default: return { color: 'var(--text-secondary)' };
        }
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

    const toggleExpand = (accountId) => {
        setExpandedAccount(expandedAccount === accountId ? null : accountId);
    };

    const renderMiniBar = (value, maxVal = 1, label = '') => {
        const pct = Math.min(100, (value / maxVal) * 100);
        return (
            <div className="mini-bar-wrapper">
                <div className="mini-bar">
                    <div
                        className="mini-bar__fill"
                        style={{
                            width: `${pct}%`,
                            background: pct > 70 ? '#ff6b6b' : pct > 40 ? 'var(--accent-warning)' : 'var(--accent-success)'
                        }}
                    />
                </div>
                <span className="mini-bar__value">{value}</span>
            </div>
        );
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
                            <th>Level</th>
                            <th>Detected Patterns</th>
                            <th>Ring ID</th>
                        </tr>
                    </thead>
                    <tbody>
                        {accounts.map((acc, idx) => (
                            <React.Fragment key={acc.account_id}>
                                <tr
                                    onClick={() => acc.scoring_details && toggleExpand(acc.account_id)}
                                    style={{ cursor: acc.scoring_details ? 'pointer' : 'default' }}
                                >
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
                                        <span style={getSuspicionLabelStyle(acc.suspicion_label)}>
                                            {acc.suspicion_label || '—'}
                                        </span>
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
                                {expandedAccount === acc.account_id && acc.scoring_details && (
                                    <tr>
                                        <td colSpan={6} style={{ padding: 0 }}>
                                            <div className="risk-details-panel">
                                                <div className="risk-details-grid risk-details-grid--three">
                                                    <div className="risk-detail-section">
                                                        <h4>Acceleration ({acc.scoring_details.acceleration_score})</h4>
                                                        <p className="detail-formula">0.4×burst + 0.3×flow + 0.2×lifespan + 0.1×velocity</p>
                                                        <div className="detail-items">
                                                            <div className="detail-item">
                                                                <span className="detail-label">Burst Ratio</span>
                                                                {renderMiniBar(acc.scoring_details.acceleration_details.burst_ratio)}
                                                            </div>
                                                            <div className="detail-item">
                                                                <span className="detail-label">Flow Ratio</span>
                                                                {renderMiniBar(acc.scoring_details.acceleration_details.flow_ratio)}
                                                            </div>
                                                            <div className="detail-item">
                                                                <span className="detail-label">Short Lifespan</span>
                                                                {renderMiniBar(acc.scoring_details.acceleration_details.short_lifespan_factor)}
                                                            </div>
                                                            <div className="detail-item">
                                                                <span className="detail-label">Velocity Ratio</span>
                                                                {renderMiniBar(acc.scoring_details.acceleration_details.velocity_ratio)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="risk-detail-section">
                                                        <h4>Stability ({acc.scoring_details.stability_score})</h4>
                                                        <p className="detail-formula">0.4×diversity + 0.35×spread + 0.25×sink</p>
                                                        <div className="detail-items">
                                                            <div className="detail-item">
                                                                <span className="detail-label">Amount Diversity</span>
                                                                {renderMiniBar(acc.scoring_details.stability_details.amount_diversity)}
                                                            </div>
                                                            <div className="detail-item">
                                                                <span className="detail-label">Hours Spread</span>
                                                                {renderMiniBar(acc.scoring_details.stability_details.active_hours_spread)}
                                                            </div>
                                                            <div className="detail-item">
                                                                <span className="detail-label">Sink Behavior</span>
                                                                {renderMiniBar(acc.scoring_details.stability_details.sink_behavior)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="risk-detail-section">
                                                        <h4>Final Score</h4>
                                                        <p className="detail-formula">(accel × (1 − stability)) × 100 + (ring_bonus × 20)</p>
                                                        <div className="detail-items">
                                                            <div className="detail-item">
                                                                <span className="detail-label">Ring Participation</span>
                                                                {renderMiniBar(acc.scoring_details.ring_participation_bonus)}
                                                            </div>
                                                            <div className="detail-item detail-item--total">
                                                                <span className="detail-label">Suspicion Score</span>
                                                                <span className="detail-value" style={getSuspicionLabelStyle(acc.suspicion_label)}>
                                                                    {acc.suspicion_score}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default SuspiciousAccountsTable;

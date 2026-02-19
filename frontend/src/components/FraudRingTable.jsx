import React from 'react';

function FraudRingTable({ rings }) {
    if (!rings || rings.length === 0) {
        return (
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>✅</div>
                <h3 style={{ color: 'var(--accent-success)' }}>No Fraud Rings Detected</h3>
                <p style={{ color: 'var(--text-tertiary)', marginTop: '0.5rem' }}>
                    The analysis did not identify any money muling ring patterns in this dataset.
                </p>
            </div>
        );
    }

    const getPatternBadgeClass = (pattern) => {
        switch (pattern) {
            case 'cycle': return 'badge--cycle';
            case 'fan_in': return 'badge--fan-in';
            case 'fan_out': return 'badge--fan-out';
            case 'fan_in_fan_out': return 'badge--fan-in-fan-out';
            case 'shell_network': return 'badge--shell';
            default: return 'badge--cycle';
        }
    };

    const getPatternLabel = (pattern) => {
        switch (pattern) {
            case 'cycle': return '🔄 Cycle';
            case 'fan_in': return '📥 Fan-In';
            case 'fan_out': return '📤 Fan-Out';
            case 'fan_in_fan_out': return '🔀 Fan-In/Out';
            case 'shell_network': return '🐚 Shell Network';
            default: return pattern;
        }
    };

    const getScoreColor = (score) => {
        if (score >= 80) return 'high';
        if (score >= 50) return 'medium';
        return 'low';
    };

    return (
        <div>
            <div className="section-header">
                <div className="section-header__title">
                    <span>🔗</span>
                    Fraud Ring Summary
                    <span className="badge badge--cycle" style={{ fontSize: '0.75rem', marginLeft: '0.5rem' }}>
                        {rings.length} ring{rings.length !== 1 ? 's' : ''}
                    </span>
                </div>
            </div>

            <div className="table-container" id="fraud-ring-table">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Ring ID</th>
                            <th>Pattern Type</th>
                            <th>Member Count</th>
                            <th>Risk Score</th>
                            <th>Member Account IDs</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rings.map((ring) => (
                            <tr key={ring.ring_id}>
                                <td>
                                    <span className="cell-mono">{ring.ring_id}</span>
                                </td>
                                <td>
                                    <span className={`badge ${getPatternBadgeClass(ring.pattern_type)}`}>
                                        {getPatternLabel(ring.pattern_type)}
                                    </span>
                                </td>
                                <td>
                                    <span className="cell-mono">{ring.member_accounts.length}</span>
                                </td>
                                <td>
                                    <div className="cell-score">
                                        <span className="cell-mono">{ring.risk_score}</span>
                                        <div className="score-bar">
                                            <div
                                                className={`score-bar__fill score-bar__fill--${getScoreColor(ring.risk_score)}`}
                                                style={{ width: `${ring.risk_score}%` }}
                                            />
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <div className="members-list">
                                        {ring.member_accounts.map((id, idx) => (
                                            <span key={idx} className="members-list__item">{id}</span>
                                        ))}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default FraudRingTable;

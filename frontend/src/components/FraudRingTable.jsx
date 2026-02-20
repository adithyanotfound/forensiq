import React, { useState } from 'react';

function FraudRingTable({ rings }) {
    const [expandedRing, setExpandedRing] = useState(null);

    if (!rings || rings.length === 0) {
        return (
            <div style={{
                textAlign: 'center',
                padding: '3rem',
                background: 'var(--bg-primary)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-subtle)'
            }}>
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
            case 'cycle': return 'Cycle';
            case 'fan_in': return 'Fan-In';
            case 'fan_out': return 'Fan-Out';
            case 'fan_in_fan_out': return 'Fan-In/Out';
            case 'shell_network': return 'Shell Network';
            default: return pattern;
        }
    };

    const getScoreColor = (score) => {
        if (score >= 80) return 'high';
        if (score >= 50) return 'medium';
        return 'low';
    };

    const getRiskLabelStyle = (label) => {
        switch (label) {
            case 'Critical': return { color: '#ff4757', fontWeight: 700 };
            case 'High': return { color: '#ff6b6b', fontWeight: 600 };
            case 'Medium': return { color: 'var(--accent-warning)', fontWeight: 600 };
            case 'Low': return { color: 'var(--accent-success)', fontWeight: 500 };
            default: return { color: 'var(--text-secondary)' };
        }
    };

    const toggleExpand = (ringId) => {
        setExpandedRing(expandedRing === ringId ? null : ringId);
    };

    return (
        <div className="table-wrapper">
            <div className="table-wrapper__title">
                Fraud Ring Summary
                <span className="table-wrapper__count">
                    {rings.length} ring{rings.length !== 1 ? 's' : ''}
                </span>
            </div>

            <div className="table-container" id="fraud-ring-table">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Ring ID</th>
                            <th>Pattern Type</th>
                            <th>Member Count</th>
                            <th>Risk Score</th>
                            <th>Risk Level</th>
                            <th>Member Account IDs</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rings.map((ring) => (
                            <React.Fragment key={ring.ring_id}>
                                <tr
                                    onClick={() => ring.risk_details && toggleExpand(ring.ring_id)}
                                    style={{ cursor: ring.risk_details ? 'pointer' : 'default' }}
                                >
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
                                        <span style={getRiskLabelStyle(ring.risk_label)}>
                                            {ring.risk_label || '—'}
                                        </span>
                                    </td>
                                    <td>
                                        <span className="members-list-inline">
                                            {ring.member_accounts.join(', ')}
                                        </span>
                                    </td>
                                </tr>
                                {expandedRing === ring.ring_id && ring.risk_details && (
                                    <tr>
                                        <td colSpan={6} style={{ padding: 0 }}>
                                            <div className="risk-details-panel">
                                                <div className="risk-details-grid">
                                                    <div className="risk-detail-section">
                                                        <h4>Ring Features</h4>
                                                        <div className="detail-items">
                                                            <div className="detail-item">
                                                                <span className="detail-label">Ring Size</span>
                                                                <span className="detail-value">{ring.risk_details.features.ring_size}</span>
                                                            </div>
                                                            <div className="detail-item">
                                                                <span className="detail-label">Hop Length</span>
                                                                <span className="detail-value">{ring.risk_details.features.hop_length}</span>
                                                            </div>
                                                            <div className="detail-item">
                                                                <span className="detail-label">Time Window</span>
                                                                <span className="detail-value">{ring.risk_details.features.total_time_window_hours}h</span>
                                                            </div>
                                                            <div className="detail-item">
                                                                <span className="detail-label">Avg Gap</span>
                                                                <span className="detail-value">{ring.risk_details.features.average_inter_txn_gap}h</span>
                                                            </div>
                                                            <div className="detail-item">
                                                                <span className="detail-label">Amount Moved</span>
                                                                <span className="detail-value">${ring.risk_details.features.total_amount_moved.toLocaleString()}</span>
                                                            </div>
                                                            <div className="detail-item">
                                                                <span className="detail-label">Shell Ratio</span>
                                                                <span className="detail-value">{ring.risk_details.features.shell_node_ratio}</span>
                                                            </div>
                                                            <div className="detail-item">
                                                                <span className="detail-label">Inflow/Outflow</span>
                                                                <span className="detail-value">{ring.risk_details.features.inflow_outflow_ratio ?? '—'}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="risk-detail-section">
                                                        <h4>Score Breakdown</h4>
                                                        <div className="detail-items">
                                                            <div className="detail-item">
                                                                <span className="detail-label">Base ({ring.risk_details.pattern_type_normalized})</span>
                                                                <span className="detail-value detail-value--base">{ring.risk_details.base_score}</span>
                                                            </div>
                                                            <div className="detail-item">
                                                                <span className="detail-label">+ Time Compression</span>
                                                                <span className="detail-value detail-value--bonus">+{ring.risk_details.bonuses.time_compression}</span>
                                                            </div>
                                                            <div className="detail-item">
                                                                <span className="detail-label">+ Flow-Through</span>
                                                                <span className="detail-value detail-value--bonus">+{ring.risk_details.bonuses.flow_through}</span>
                                                            </div>
                                                            <div className="detail-item">
                                                                <span className="detail-label">+ Shell Density</span>
                                                                <span className="detail-value detail-value--bonus">+{ring.risk_details.bonuses.shell_density}</span>
                                                            </div>
                                                            <div className="detail-item">
                                                                <span className="detail-label">+ Hop Length</span>
                                                                <span className="detail-value detail-value--bonus">+{ring.risk_details.bonuses.hop_length}</span>
                                                            </div>
                                                            <div className="detail-item detail-item--total">
                                                                <span className="detail-label">Total Risk</span>
                                                                <span className="detail-value" style={getRiskLabelStyle(ring.risk_label)}>{ring.risk_score}</span>
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

export default FraudRingTable;

import React from 'react';

function StatsGrid({ summary }) {
    return (
        <div className="stats-grid">
            <div className="stat-card stat-card--accounts" id="stat-total-accounts">
                <div className="stat-card__label">Total Accounts Analyzed</div>
                <div className="stat-card__value">
                    {summary.total_accounts_analyzed.toLocaleString()}
                </div>
            </div>
            <div className="stat-card stat-card--suspicious" id="stat-suspicious">
                <div className="stat-card__label">Suspicious Accounts</div>
                <div className="stat-card__value">
                    {summary.suspicious_accounts_flagged.toLocaleString()}
                </div>
            </div>
            <div className="stat-card stat-card--rings" id="stat-rings">
                <div className="stat-card__label">Fraud Rings Detected</div>
                <div className="stat-card__value">
                    {summary.fraud_rings_detected.toLocaleString()}
                </div>
            </div>
            <div className="stat-card stat-card--time" id="stat-time">
                <div className="stat-card__label">Processing Time</div>
                <div className="stat-card__value">
                    {summary.processing_time_seconds}
                    <span className="stat-card__unit">sec</span>
                </div>
            </div>
        </div>
    );
}

export default StatsGrid;

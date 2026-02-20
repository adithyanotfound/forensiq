import React, { useMemo } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

function Dashboard({ results }) {
    const { summary, graph_data, fraud_rings, suspicious_accounts } = results;

    // Build time-series data from graph edges (using timestamps)
    const timeSeriesData = useMemo(() => {
        if (!graph_data || !graph_data.edges || graph_data.edges.length === 0) {
            return { labels: [], totalAccounts: [], suspiciousAccounts: [], fraudRings: [] };
        }

        const edges = graph_data.edges
            .filter(e => e.timestamp)
            .map(e => ({ ...e, ts: new Date(e.timestamp) }))
            .sort((a, b) => a.ts - b.ts);

        if (edges.length === 0) {
            return { labels: [], totalAccounts: [], suspiciousAccounts: [], fraudRings: [] };
        }

        const suspiciousIds = new Set(suspicious_accounts.map(a => a.account_id));
        const ringMemberSets = fraud_rings.map(r => new Set(r.member_accounts));

        const minTs = edges[0].ts.getTime();
        const maxTs = edges[edges.length - 1].ts.getTime();
        const range = maxTs - minTs;
        const bucketCount = Math.min(12, Math.max(4, Math.ceil(edges.length / 20)));
        const bucketSize = range / bucketCount || 1;

        const buckets = [];
        for (let i = 0; i < bucketCount; i++) {
            const bucketStart = minTs + i * bucketSize;
            const bucketEnd = bucketStart + bucketSize;
            const date = new Date(bucketStart);
            buckets.push({
                label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                totalAccountsSet: new Set(),
                suspiciousSet: new Set(),
                ringSet: new Set(),
                start: bucketStart,
                end: bucketEnd
            });
        }

        const seenAccounts = new Set();
        const seenSuspicious = new Set();
        const seenRingMembers = new Set();

        for (const edge of edges) {
            const t = edge.ts.getTime();
            seenAccounts.add(edge.source);
            seenAccounts.add(edge.target);
            if (suspiciousIds.has(edge.source)) seenSuspicious.add(edge.source);
            if (suspiciousIds.has(edge.target)) seenSuspicious.add(edge.target);
            for (const rSet of ringMemberSets) {
                if (rSet.has(edge.source)) seenRingMembers.add(edge.source);
                if (rSet.has(edge.target)) seenRingMembers.add(edge.target);
            }

            for (let i = 0; i < buckets.length; i++) {
                if (t >= buckets[i].start && (t < buckets[i].end || i === buckets.length - 1)) {
                    buckets[i].totalAccountsSet = new Set(seenAccounts);
                    buckets[i].suspiciousSet = new Set(seenSuspicious);
                    buckets[i].ringSet = new Set(seenRingMembers);
                    break;
                }
            }
        }

        for (let i = 1; i < buckets.length; i++) {
            if (buckets[i].totalAccountsSet.size === 0) {
                buckets[i].totalAccountsSet = new Set(buckets[i - 1].totalAccountsSet);
                buckets[i].suspiciousSet = new Set(buckets[i - 1].suspiciousSet);
                buckets[i].ringSet = new Set(buckets[i - 1].ringSet);
            }
        }

        return {
            labels: buckets.map(b => b.label),
            totalAccounts: buckets.map(b => b.totalAccountsSet.size),
            suspiciousAccounts: buckets.map(b => b.suspiciousSet.size),
            fraudRings: buckets.map(b => b.ringSet.size)
        };
    }, [graph_data, suspicious_accounts, fraud_rings]);

    // Mini sparkline for stat tiles — with interactive tooltip
    const createSparklineData = (data, color, labels) => ({
        labels: labels || data.map((_, i) => i),
        datasets: [{
            data,
            borderColor: color,
            backgroundColor: color + '20',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: color,
            pointHoverBorderColor: '#fff',
            pointHoverBorderWidth: 2,
        }],
    });

    const sparklineOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index',
            intersect: false,
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                enabled: true,
                backgroundColor: '#1a1a1a',
                titleColor: '#a0a0a0',
                bodyColor: '#f1f5f9',
                borderColor: 'rgba(255,255,255,0.12)',
                borderWidth: 1,
                titleFont: { family: 'Geist', size: 11, weight: '500' },
                bodyFont: { family: 'Geist Mono', size: 13, weight: '700' },
                padding: 10,
                cornerRadius: 8,
                displayColors: false,
                caretSize: 5,
                callbacks: {
                    title: (items) => {
                        if (items.length && timeSeriesData.labels.length > items[0].dataIndex) {
                            return timeSeriesData.labels[items[0].dataIndex];
                        }
                        return '';
                    },
                    label: (context) => {
                        return `${context.parsed.y.toLocaleString()}`;
                    },
                },
            },
        },
        scales: {
            x: { display: false },
            y: { display: false },
        },
        elements: {
            line: { borderWidth: 2 },
        },
    };

    // Histogram data - FULL OPACITY colors
    const histogramData = {
        labels: timeSeriesData.labels,
        datasets: [
            {
                label: 'Total Accounts',
                data: timeSeriesData.totalAccounts,
                backgroundColor: '#ffba08',
                borderColor: '#ffd000',
                borderWidth: 1,
                borderRadius: 4,
            },
            {
                label: 'Suspicious Accounts',
                data: timeSeriesData.suspiciousAccounts,
                backgroundColor: '#dc2f02',
                borderColor: '#e85d04',
                borderWidth: 1,
                borderRadius: 4,
            },
        ],
    };

    const histogramOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: true,
                position: 'top',
                labels: {
                    color: '#a0a0a0',
                    font: { family: 'Geist', size: 12 },
                    usePointStyle: true,
                    padding: 20,
                },
            },
            tooltip: {
                backgroundColor: '#1a1a1a',
                titleColor: '#f1f5f9',
                bodyColor: '#a0a0a0',
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 1,
                titleFont: { family: 'Geist', weight: '600' },
                bodyFont: { family: 'Geist' },
                padding: 12,
                cornerRadius: 8,
            },
        },
        scales: {
            x: {
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: { color: '#6b6b6b', font: { family: 'Geist', size: 11 } },
            },
            y: {
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: { color: '#6b6b6b', font: { family: 'Geist', size: 11 } },
                beginAtZero: true,
            },
        },
    };

    return (
        <div className="dashboard">
            {/* Dashboard header with title and processing time */}
            <div className="dashboard__header">
                <h2 className="dashboard__title">Dashboard</h2>
                <span className="dashboard__processing-time">
                    Processing Time: {summary.processing_time_seconds}s
                </span>
            </div>

            {/* Stat tiles */}
            <div className="stats-tiles">
                <div className="stat-tile stat-tile--accounts" id="stat-total-accounts">
                    <div className="stat-tile__label">Total Accounts</div>
                    <div className="stat-tile__value">
                        {summary.total_accounts_analyzed.toLocaleString()}
                    </div>
                    <div className="stat-tile__chart">
                        <Line
                            data={createSparklineData(timeSeriesData.totalAccounts, '#ffba08', timeSeriesData.labels)}
                            options={sparklineOptions}
                        />
                    </div>
                </div>

                <div className="stat-tile stat-tile--suspicious" id="stat-suspicious">
                    <div className="stat-tile__label">Suspicious Accounts</div>
                    <div className="stat-tile__value">
                        {summary.suspicious_accounts_flagged.toLocaleString()}
                    </div>
                    <div className="stat-tile__chart">
                        <Line
                            data={createSparklineData(timeSeriesData.suspiciousAccounts, '#dc2f02', timeSeriesData.labels)}
                            options={sparklineOptions}
                        />
                    </div>
                </div>

                <div className="stat-tile stat-tile--rings" id="stat-rings">
                    <div className="stat-tile__label">Fraud Rings</div>
                    <div className="stat-tile__value">
                        {summary.fraud_rings_detected.toLocaleString()}
                    </div>
                    <div className="stat-tile__chart">
                        <Line
                            data={createSparklineData(timeSeriesData.fraudRings, '#70e000', timeSeriesData.labels)}
                            options={sparklineOptions}
                        />
                    </div>
                </div>
            </div>

            {/* Histogram */}
            <div className="dashboard__histogram">
                <div className="dashboard__histogram-title">Accounts Over Time</div>
                <div className="dashboard__histogram-chart">
                    <Bar data={histogramData} options={histogramOptions} />
                </div>
            </div>
        </div>
    );
}

export default Dashboard;

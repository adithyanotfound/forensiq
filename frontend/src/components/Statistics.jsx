import React, { useMemo, useCallback } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

ChartJS.register(ArcElement, Tooltip, Legend);

function Statistics({ results }) {
    const { fraud_rings, suspicious_accounts } = results;

    // Compute pattern-specific counts
    const stats = useMemo(() => {
        let cycle3 = 0, cycle4 = 0, cycle5 = 0;
        let fanIn = 0, fanOut = 0;
        let shellNetwork = 0;

        for (const ring of fraud_rings) {
            const pt = ring.pattern_type;
            if (pt === 'cycle') {
                const len = ring.cycle_length || ring.member_accounts.length;
                if (len === 3) cycle3++;
                else if (len === 4) cycle4++;
                else if (len >= 5) cycle5++;
                else cycle3++; // default
            } else if (pt === 'fan_in') {
                fanIn++;
            } else if (pt === 'fan_out') {
                fanOut++;
            } else if (pt === 'fan_in_fan_out') {
                fanIn++;
                fanOut++;
            } else if (pt === 'shell_network') {
                shellNetwork++;
            }
        }

        return { cycle3, cycle4, cycle5, fanIn, fanOut, shellNetwork };
    }, [fraud_rings]);

    const totalCycles = stats.cycle3 + stats.cycle4 + stats.cycle5;
    const totalSmurfing = stats.fanIn + stats.fanOut;

    // Pie chart colors
    const cycle3Color = '#ff99cc';
    const cycle4Color = '#ff4da6';
    const cycle5Color = '#ff007f';
    const fanInColor = '#66ff66';
    const fanOutColor = '#33cc33';
    const shellColor = '#ff8c00';

    const pieData = {
        labels: [
            '3-Node Cycle',
            '4-Node Cycle',
            '5+ Node Cycle',
            'Fan-In (Smurfing)',
            'Fan-Out (Smurfing)',
            'Layered Chain Network'
        ],
        datasets: [{
            data: [
                stats.cycle3,
                stats.cycle4,
                stats.cycle5,
                stats.fanIn,
                stats.fanOut,
                stats.shellNetwork
            ],
            backgroundColor: [
                cycle3Color,
                cycle4Color,
                cycle5Color,
                fanInColor,
                fanOutColor,
                shellColor,
            ],
            borderColor: 'transparent',
            borderWidth: 0,
            hoverBorderColor: 'transparent',
            hoverBorderWidth: 0,
            hoverOffset: 8,
        }],
    };

    const pieOptions = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '55%',
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    color: '#c0c0c0',
                    font: { family: 'Geist', size: 14, weight: '500' },
                    usePointStyle: true,
                    padding: 18,
                },
            },
            tooltip: {
                backgroundColor: '#1a1a1a',
                titleColor: '#f1f5f9',
                bodyColor: '#d0d0d0',
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 1,
                titleFont: { family: 'Geist', weight: '600', size: 14 },
                bodyFont: { family: 'Geist', size: 13 },
                padding: 14,
                cornerRadius: 8,
                callbacks: {
                    label: function (context) {
                        const label = context.label || '';
                        const value = context.parsed;
                        return ` ${label}: ${value}`;
                    }
                }
            },
        },
    };

    // PDF download
    const handleDownloadPDF = useCallback(() => {
        try {
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();

            // Background
            doc.setFillColor(26, 26, 26);
            doc.rect(0, 0, pageWidth, doc.internal.pageSize.getHeight(), 'F');

            // Title
            doc.setFontSize(20);
            doc.setTextColor(20, 184, 166);
            doc.text('Forensiq Report', pageWidth / 2, 22, { align: 'center' });

            doc.setFontSize(10);
            doc.setTextColor(160, 160, 160);
            doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, 30, { align: 'center' });

            // Divider
            doc.setDrawColor(60, 60, 60);
            doc.line(14, 34, pageWidth - 14, 34);

            // Summary stats heading
            doc.setFontSize(14);
            doc.setTextColor(241, 245, 249);
            doc.text('Pattern Detection Summary', 14, 44);

            const summaryBody = [
                ['Cycle', '3-Node Cycle', String(stats.cycle3)],
                ['Cycle', '4-Node Cycle', String(stats.cycle4)],
                ['Cycle', '5+ Node Cycle', String(stats.cycle5)],
                ['Cycle', 'Total Cycles', String(totalCycles)],
                ['Smurfing', 'Fan-In', String(stats.fanIn)],
                ['Smurfing', 'Fan-Out', String(stats.fanOut)],
                ['Smurfing', 'Total Smurfing', String(totalSmurfing)],
                ['Layered Network', 'Chain Networks', String(stats.shellNetwork)],
            ];

            autoTable(doc, {
                startY: 50,
                head: [['Category', 'Type', 'Count']],
                body: summaryBody,
                theme: 'grid',
                styles: {
                    fillColor: [30, 30, 30],
                    textColor: [220, 220, 220],
                    fontSize: 10,
                    font: 'helvetica',
                    cellPadding: 4,
                    lineColor: [60, 60, 60],
                    lineWidth: 0.5,
                },
                headStyles: {
                    fillColor: [42, 42, 42],
                    textColor: [220, 47, 2],
                    fontSize: 10,
                    fontStyle: 'bold',
                },
                alternateRowStyles: {
                    fillColor: [36, 36, 36],
                },
            });

            // Fraud Rings Detail
            if (fraud_rings.length > 0) {
                const ringY = doc.lastAutoTable.finalY + 15;

                // Check if we need a new page
                if (ringY > 240) {
                    doc.addPage();
                    doc.setFillColor(26, 26, 26);
                    doc.rect(0, 0, pageWidth, doc.internal.pageSize.getHeight(), 'F');
                    doc.setFontSize(14);
                    doc.setTextColor(241, 245, 249);
                    doc.text('Fraud Rings Detail', 14, 20);

                    autoTable(doc, {
                        startY: 26,
                        head: [['Ring ID', 'Pattern', 'Members', 'Risk Score', 'Member Accounts']],
                        body: fraud_rings.map(ring => [
                            ring.ring_id,
                            ring.pattern_type,
                            String(ring.member_accounts.length),
                            String(ring.risk_score),
                            ring.member_accounts.join(', ')
                        ]),
                        theme: 'grid',
                        styles: {
                            fillColor: [30, 30, 30],
                            textColor: [220, 220, 220],
                            fontSize: 8,
                            font: 'helvetica',
                            cellPadding: 3,
                            lineColor: [60, 60, 60],
                            lineWidth: 0.5,
                        },
                        headStyles: {
                            fillColor: [42, 42, 42],
                            textColor: [220, 47, 2],
                            fontSize: 9,
                            fontStyle: 'bold',
                        },
                        alternateRowStyles: {
                            fillColor: [36, 36, 36],
                        },
                        columnStyles: {
                            4: { cellWidth: 55 }
                        },
                    });
                } else {
                    doc.setFontSize(14);
                    doc.setTextColor(241, 245, 249);
                    doc.text('Fraud Rings Detail', 14, ringY);

                    autoTable(doc, {
                        startY: ringY + 6,
                        head: [['Ring ID', 'Pattern', 'Members', 'Risk Score', 'Member Accounts']],
                        body: fraud_rings.map(ring => [
                            ring.ring_id,
                            ring.pattern_type,
                            String(ring.member_accounts.length),
                            String(ring.risk_score),
                            ring.member_accounts.join(', ')
                        ]),
                        theme: 'grid',
                        styles: {
                            fillColor: [30, 30, 30],
                            textColor: [220, 220, 220],
                            fontSize: 8,
                            font: 'helvetica',
                            cellPadding: 3,
                            lineColor: [60, 60, 60],
                            lineWidth: 0.5,
                        },
                        headStyles: {
                            fillColor: [42, 42, 42],
                            textColor: [220, 47, 2],
                            fontSize: 9,
                            fontStyle: 'bold',
                        },
                        alternateRowStyles: {
                            fillColor: [36, 36, 36],
                        },
                        columnStyles: {
                            4: { cellWidth: 55 }
                        },
                    });
                }
            }

            // Suspicious Accounts on new page
            if (suspicious_accounts.length > 0) {
                doc.addPage();
                doc.setFillColor(26, 26, 26);
                doc.rect(0, 0, pageWidth, doc.internal.pageSize.getHeight(), 'F');

                doc.setFontSize(14);
                doc.setTextColor(241, 245, 249);
                doc.text('Suspicious Accounts', 14, 20);

                autoTable(doc, {
                    startY: 26,
                    head: [['#', 'Account ID', 'Score', 'Patterns', 'Ring ID']],
                    body: suspicious_accounts.map((acc, idx) => [
                        String(idx + 1),
                        acc.account_id,
                        String(acc.suspicion_score),
                        acc.detected_patterns.join(', '),
                        acc.ring_id
                    ]),
                    theme: 'grid',
                    styles: {
                        fillColor: [30, 30, 30],
                        textColor: [220, 220, 220],
                        fontSize: 8,
                        font: 'helvetica',
                        cellPadding: 3,
                        lineColor: [60, 60, 60],
                        lineWidth: 0.5,
                    },
                    headStyles: {
                        fillColor: [42, 42, 42],
                        textColor: [220, 47, 2],
                        fontSize: 9,
                        fontStyle: 'bold',
                    },
                    alternateRowStyles: {
                        fillColor: [36, 36, 36],
                    },
                });
            }

            doc.save('forensics_report.pdf');
        } catch (err) {
            console.error('PDF generation error:', err);
            alert('Failed to generate PDF. Please try again.');
        }
    }, [stats, totalCycles, totalSmurfing, fraud_rings, suspicious_accounts]);

    return (
        <div className="statistics-page">
            {/* Doughnut chart section (2/3) */}
            <div className="statistics__chart-section">
                <div className="statistics__chart-title">Detection Pattern Distribution</div>
                <div className="statistics__chart-container">
                    <Doughnut data={pieData} options={pieOptions} />
                </div>
            </div>

            {/* Summary stats section (1/3) */}
            <div className="statistics__summary-section">
                <div className="statistics__summary-title">Summary Statistics</div>

                {/* Cycles */}
                <div className="summary-group">
                    <div className="summary-group__title">Cycles</div>
                    <div className="summary-row">
                        <span className="summary-row__label">
                            <span className="summary-row__dot" style={{ background: cycle3Color }}></span>
                            3-Node Cycle
                        </span>
                        <span className="summary-row__value">{stats.cycle3}</span>
                    </div>
                    <div className="summary-row">
                        <span className="summary-row__label">
                            <span className="summary-row__dot" style={{ background: cycle4Color }}></span>
                            4-Node Cycle
                        </span>
                        <span className="summary-row__value">{stats.cycle4}</span>
                    </div>
                    <div className="summary-row">
                        <span className="summary-row__label">
                            <span className="summary-row__dot" style={{ background: cycle5Color }}></span>
                            5+ Node Cycle
                        </span>
                        <span className="summary-row__value">{stats.cycle5}</span>
                    </div>
                </div>

                {/* Smurfing */}
                <div className="summary-group">
                    <div className="summary-group__title">Smurfing</div>
                    <div className="summary-row">
                        <span className="summary-row__label">
                            <span className="summary-row__dot" style={{ background: fanInColor }}></span>
                            Fan-In
                        </span>
                        <span className="summary-row__value">{stats.fanIn}</span>
                    </div>
                    <div className="summary-row">
                        <span className="summary-row__label">
                            <span className="summary-row__dot" style={{ background: fanOutColor }}></span>
                            Fan-Out
                        </span>
                        <span className="summary-row__value">{stats.fanOut}</span>
                    </div>
                </div>

                {/* Layered Chain */}
                <div className="summary-group">
                    <div className="summary-group__title">Layered Network</div>
                    <div className="summary-row">
                        <span className="summary-row__label">
                            <span className="summary-row__dot" style={{ background: shellColor }}></span>
                            Chain Networks
                        </span>
                        <span className="summary-row__value">{stats.shellNetwork}</span>
                    </div>
                </div>

                {/* PDF Download */}
                <div className="statistics__pdf-btn">
                    <button className="btn btn--primary" onClick={handleDownloadPDF} id="download-pdf-btn">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                            <polyline points="10 9 9 9 8 9" />
                        </svg>
                        Download PDF Report
                    </button>
                </div>
            </div>
        </div>
    );
}

export default Statistics;

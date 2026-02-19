import React, { useState, useCallback } from 'react';
import FileUpload from './components/FileUpload';
import StatsGrid from './components/StatsGrid';
import GraphVisualization from './components/GraphVisualization';
import FraudRingTable from './components/FraudRingTable';
import SuspiciousAccountsTable from './components/SuspiciousAccountsTable';

function App() {
    const [results, setResults] = useState(null);
    const [sessionId, setSessionId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressText, setProgressText] = useState('');
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('graph');

    const handleUpload = useCallback(async (file) => {
        setLoading(true);
        setError(null);
        setResults(null);
        setProgress(0);
        setProgressText('Uploading CSV file...');

        try {
            const formData = new FormData();
            formData.append('file', file);

            setProgress(20);
            setProgressText('Parsing transactions...');

            const response = await fetch('/api/analyze', {
                method: 'POST',
                body: formData,
            });

            setProgress(60);
            setProgressText('Running detection algorithms...');

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || errData.message || 'Analysis failed');
            }

            const data = await response.json();

            setProgress(90);
            setProgressText('Building visualization...');

            // Small delay for animation
            await new Promise(r => setTimeout(r, 300));

            setResults(data.results);
            setSessionId(data.sessionId);
            setProgress(100);
            setProgressText('Analysis complete!');

            // Reset progress after a moment
            setTimeout(() => {
                setProgress(0);
                setProgressText('');
            }, 1500);

        } catch (err) {
            setError(err.message);
            setProgress(0);
            setProgressText('');
        } finally {
            setLoading(false);
        }
    }, []);

    const handleDownload = useCallback(() => {
        if (!sessionId) return;
        window.open(`/api/download/${sessionId}`, '_blank');
    }, [sessionId]);

    const handleReset = useCallback(() => {
        setResults(null);
        setSessionId(null);
        setError(null);
        setProgress(0);
        setProgressText('');
        setActiveTab('graph');
    }, []);

    return (
        <div className="app-container">
            {/* Header */}
            <header className="header">
                <div className="header__badge">
                    <span>🔬</span>
                    <span>Advanced Threat Detection</span>
                </div>
                <h1 className="header__title">Financial Forensics Engine</h1>
                <p className="header__subtitle">
                    Expose money muling networks through graph analysis, cycle detection, and intelligent pattern recognition.
                </p>
            </header>

            {/* Upload Section */}
            {!results && (
                <div className="fade-in">
                    <FileUpload
                        onUpload={handleUpload}
                        loading={loading}
                        progress={progress}
                        progressText={progressText}
                    />
                </div>
            )}

            {/* Error Display */}
            {error && (
                <div className="error-banner fade-in">
                    <span className="error-banner__icon">⚠️</span>
                    <div className="error-banner__text">
                        <strong>Analysis Error:</strong> {error}
                    </div>
                </div>
            )}

            {/* Results Section */}
            {results && (
                <>
                    {/* Stats */}
                    <div className="fade-in">
                        <StatsGrid summary={results.summary} />
                    </div>

                    {/* Action Buttons */}
                    <div className="download-section fade-in fade-in-delay-1">
                        <button className="btn btn--primary btn--lg" onClick={handleDownload} id="download-json-btn">
                            <span>📥</span>
                            Download JSON Report
                        </button>
                        <button className="btn btn--secondary btn--lg" onClick={handleReset} id="reset-btn">
                            <span>🔄</span>
                            New Analysis
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="tabs fade-in fade-in-delay-2">
                        <button
                            className={`tab ${activeTab === 'graph' ? 'tab--active' : ''}`}
                            onClick={() => setActiveTab('graph')}
                            id="tab-graph"
                        >
                            🕸️ Network Graph
                        </button>
                        <button
                            className={`tab ${activeTab === 'rings' ? 'tab--active' : ''}`}
                            onClick={() => setActiveTab('rings')}
                            id="tab-rings"
                        >
                            🔗 Fraud Rings
                        </button>
                        <button
                            className={`tab ${activeTab === 'accounts' ? 'tab--active' : ''}`}
                            onClick={() => setActiveTab('accounts')}
                            id="tab-accounts"
                        >
                            🚨 Suspicious Accounts
                        </button>
                    </div>

                    {/* Content Area */}
                    {activeTab === 'graph' && (
                        <div className="fade-in fade-in-delay-3">
                            <GraphVisualization graphData={results.graph_data} fraudRings={results.fraud_rings} />
                        </div>
                    )}

                    {activeTab === 'rings' && (
                        <div className="fade-in fade-in-delay-3">
                            <FraudRingTable rings={results.fraud_rings} />
                        </div>
                    )}

                    {activeTab === 'accounts' && (
                        <div className="fade-in fade-in-delay-3">
                            <SuspiciousAccountsTable accounts={results.suspicious_accounts} />
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default App;

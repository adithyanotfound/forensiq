import React, { useState, useCallback } from 'react';
import FileUpload from './components/FileUpload';
import Dashboard from './components/Dashboard';
import GraphVisualization from './components/GraphVisualization';
import FraudRingTable from './components/FraudRingTable';
import SuspiciousAccountsTable from './components/SuspiciousAccountsTable';
import Statistics from './components/Statistics';
import Antigravity from './components/Antigravity';

function App() {
    const [results, setResults] = useState(null);
    const [sessionId, setSessionId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressText, setProgressText] = useState('');
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('dashboard');
    const [sidebarOpen, setSidebarOpen] = useState(false);

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

            const response = await fetch('https://runtime-terrors-api.onrender.com/api/analyze', {
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
        window.open(`https://runtime-terrors-api.onrender.com/api/download/${sessionId}`, '_blank');
    }, [sessionId]);

    const handleReset = useCallback(() => {
        setResults(null);
        setSessionId(null);
        setError(null);
        setProgress(0);
        setProgressText('');
        setActiveTab('dashboard');
        setSidebarOpen(false);
    }, []);

    const handleNavClick = useCallback((tab) => {
        setActiveTab(tab);
        setSidebarOpen(false);
    }, []);

    // Upload page
    if (!results) {
        return (
            <>
                {/* Loading overlay */}
                {loading && (
                    <div className="loading-overlay">
                        <div className="loading-hourglass">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M5 2h14M5 22h14M7 2v4.5L12 12l-5 5.5V22M17 2v4.5L12 12l5 5.5V22" />
                            </svg>
                        </div>
                        <div className="loading-text">{progressText}</div>
                        <div className="loading-progress">
                            <div className="loading-progress__fill" style={{ width: `${progress}%` }} />
                        </div>
                    </div>
                )}

                <div className="upload-page">
                    {/* Background Antigravity particle effect */}
                    <div className="landing-bg">
                        <Antigravity
                            count={300}
                            magnetRadius={6}
                            ringRadius={7}
                            waveSpeed={0.4}
                            waveAmplitude={1}
                            particleSize={1.5}
                            lerpSpeed={0.05}
                            color="#5227FF"
                            autoAnimate
                            particleVariance={1}
                            rotationSpeed={0}
                            depthFactor={1}
                            pulseSpeed={3}
                            particleShape="capsule"
                            fieldStrength={10}
                        />
                    </div>

                    {/* Header */}
                    <header className="header">
                        <div className="header__badge">
                            <span>Advanced Threat Detection</span>
                        </div>
                        <h1 className="header__title">Forensiq Engine</h1>
                        <p className="header__subtitle">
                            Expose money muling networks through graph analysis, cycle detection, and intelligent pattern recognition.
                        </p>
                    </header>

                    <FileUpload
                        onUpload={handleUpload}
                        loading={loading}
                        progress={progress}
                        progressText={progressText}
                    />

                    {/* Error Display */}
                    {error && (
                        <div className="error-banner fade-in">
                            <div className="error-banner__icon">
                                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                    <path d="M10 2L18 17H2L10 2Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
                                    <path d="M10 8v4M10 14h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                </svg>
                            </div>
                            <div className="error-banner__text">
                                <strong>Analysis Error:</strong> {error}
                            </div>
                        </div>
                    )}
                </div>
            </>
        );
    }

    // Results page with sidebar
    return (
        <div className="results-layout">
            {/* Hamburger button for mobile */}
            <button
                className="hamburger"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                id="hamburger-btn"
                aria-label="Toggle navigation"
            >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    {sidebarOpen ? (
                        <>
                            <path d="M18 6L6 18" />
                            <path d="M6 6l12 12" />
                        </>
                    ) : (
                        <>
                            <path d="M3 6h18" />
                            <path d="M3 12h18" />
                            <path d="M3 18h18" />
                        </>
                    )}
                </svg>
            </button>

            {/* Sidebar overlay for mobile */}
            {sidebarOpen && (
                <div
                    className="sidebar-overlay sidebar-overlay--visible"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''}`} id="sidebar">
                <div className="sidebar__brand" onClick={handleReset} id="brand-home-link">
                    <div className="sidebar__brand-name">Forensiq</div>
                    <div className="sidebar__brand-sub">Money Muling Detector</div>
                </div>

                <nav className="sidebar__nav">
                    <button
                        className={`sidebar__nav-item ${activeTab === 'dashboard' ? 'sidebar__nav-item--active' : ''}`}
                        onClick={() => handleNavClick('dashboard')}
                        id="nav-dashboard"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                            <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                        </svg>
                        Dashboard
                    </button>

                    <button
                        className={`sidebar__nav-item ${activeTab === 'graph' ? 'sidebar__nav-item--active' : ''}`}
                        onClick={() => handleNavClick('graph')}
                        id="nav-graph"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="5" cy="12" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="19" cy="18" r="2" />
                            <path d="M7 12h8M15 7l-8 5M15 17l-8-5" />
                        </svg>
                        Network Graph
                    </button>

                    <button
                        className={`sidebar__nav-item ${activeTab === 'rings' ? 'sidebar__nav-item--active' : ''}`}
                        onClick={() => handleNavClick('rings')}
                        id="nav-rings"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                        </svg>
                        Fraud Rings Table
                    </button>

                    <button
                        className={`sidebar__nav-item ${activeTab === 'accounts' ? 'sidebar__nav-item--active' : ''}`}
                        onClick={() => handleNavClick('accounts')}
                        id="nav-accounts"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                        Suspicious Accounts
                    </button>

                    <button
                        className={`sidebar__nav-item ${activeTab === 'statistics' ? 'sidebar__nav-item--active' : ''}`}
                        onClick={() => handleNavClick('statistics')}
                        id="nav-statistics"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 20V10M12 20V4M6 20v-6" />
                        </svg>
                        Statistics
                    </button>
                </nav>

                <div className="sidebar__footer">
                    <button
                        className="sidebar__download-btn"
                        onClick={handleDownload}
                        id="download-json-btn"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Download JSON
                    </button>
                </div>
            </aside>

            {/* Main content area */}
            <main className="main-content">
                {activeTab === 'dashboard' && (
                    <div className="fade-in">
                        <Dashboard results={results} />
                    </div>
                )}

                {activeTab === 'graph' && (
                    <div className="fade-in">
                        <GraphVisualization graphData={results.graph_data} fraudRings={results.fraud_rings} />
                    </div>
                )}

                {activeTab === 'rings' && (
                    <div className="fade-in">
                        <FraudRingTable rings={results.fraud_rings} />
                    </div>
                )}

                {activeTab === 'accounts' && (
                    <div className="fade-in">
                        <SuspiciousAccountsTable accounts={results.suspicious_accounts} />
                    </div>
                )}

                {activeTab === 'statistics' && (
                    <div className="fade-in">
                        <Statistics results={results} />
                    </div>
                )}
            </main>
        </div>
    );
}

export default App;

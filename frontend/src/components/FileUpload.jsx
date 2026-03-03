import React, { useRef, useState, useCallback } from 'react';

function FileUpload({ onUpload, loading }) {
    const fileInputRef = useRef(null);
    const [dragActive, setDragActive] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);

    const handleDrag = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    }, []);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            if (file.name.endsWith('.csv')) {
                setSelectedFile(file);
            }
        }
    }, []);

    const handleChange = useCallback((e) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
        }
    }, []);

    const handleClick = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleAnalyze = useCallback(() => {
        if (selectedFile) {
            onUpload(selectedFile);
        }
    }, [selectedFile, onUpload]);

    const formatSize = (bytes) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1048576).toFixed(1)} MB`;
    };

    const handleLoadTestData = useCallback(async (url, filename) => {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Network response was not ok');
            const blob = await response.blob();
            const file = new File([blob], filename, { type: 'text/csv' });
            onUpload(file);
        } catch (error) {
            console.error('Failed to load test data:', error);
            alert('Failed to load test data. Please check if the file exists in the public directory.');
        }
    }, [onUpload]);

    return (
        <div style={{ width: '100%', maxWidth: '600px' }}>
            <div
                className={`upload-zone ${dragActive ? 'upload-zone--active' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={handleClick}
                id="upload-zone"
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleChange}
                    style={{ display: 'none' }}
                    id="csv-file-input"
                />

                <div className="upload-zone__icon">
                    {selectedFile ? (
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <path d="M9 15l2 2 4-4" />
                        </svg>
                    ) : (
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                    )}
                </div>

                {selectedFile ? (
                    <>
                        <div className="upload-zone__text">File Selected</div>
                        <div className="upload-zone__file-info">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                            </svg>
                            <span className="upload-zone__file-name">{selectedFile.name}</span>
                            <span style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
                                ({formatSize(selectedFile.size)})
                            </span>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="upload-zone__text">
                            {dragActive ? 'Drop your CSV file here' : 'Drag & drop your CSV file here'}
                        </div>
                        <div className="upload-zone__hint">
                            or click to browse | Only .csv files supported | Up to 50MB
                        </div>
                    </>
                )}
            </div>

            {selectedFile && !loading && (
                <div style={{ textAlign: 'center', marginTop: '1.5rem', position: 'relative', zIndex: 1 }} className="fade-in">
                    <button
                        className="btn btn--primary btn--lg"
                        onClick={handleAnalyze}
                        id="analyze-btn"
                    >
                        Analyze Transactions
                    </button>
                </div>
            )}

            {!loading && (
                <div style={{ textAlign: 'center', marginTop: '2rem', position: 'relative', zIndex: 1 }}>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>Or test with sample data:</p>
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                        <button
                            className="btn btn--secondary"
                            onClick={() => handleLoadTestData('/50k-transactions.csv', '50k-transactions.csv')}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '0.5rem'}}>
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            50k Transactions Data
                        </button>
                        <button
                            className="btn btn--secondary"
                            onClick={() => handleLoadTestData('/money-mulling.csv', 'money-mulling.csv')}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '0.5rem'}}>
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            Test Data
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default FileUpload;

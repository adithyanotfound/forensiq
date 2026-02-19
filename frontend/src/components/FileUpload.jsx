import React, { useRef, useState, useCallback } from 'react';

function FileUpload({ onUpload, loading, progress, progressText }) {
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

    return (
        <div>
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
                    {selectedFile ? '📄' : '☁️'}
                </div>

                {selectedFile ? (
                    <>
                        <div className="upload-zone__text">File Selected</div>
                        <div className="upload-zone__file-info">
                            <span>📎</span>
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
                            or click to browse • Supports transaction datasets up to 50MB
                        </div>
                    </>
                )}
            </div>

            {selectedFile && !loading && (
                <div style={{ textAlign: 'center', marginTop: '1.5rem' }} className="fade-in">
                    <button
                        className="btn btn--primary btn--lg"
                        onClick={handleAnalyze}
                        id="analyze-btn"
                    >
                        <span>🔍</span>
                        Analyze Transactions
                    </button>
                </div>
            )}

            {loading && (
                <div className="progress-container fade-in">
                    <div className="progress-bar">
                        <div className="progress-bar__fill" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="progress-text">
                        <span>{progressText}</span>
                        <span>{progress}%</span>
                    </div>
                </div>
            )}
        </div>
    );
}

export default FileUpload;

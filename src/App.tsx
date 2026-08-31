/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Header } from './components/Header';
import { TextInputs } from './components/TextInputs';
import { DiffToolbar } from './components/DiffToolbar';
import { ChangeSummaryCards } from './components/ChangeSummaryCards';
import { ColoredDiffViewer } from './components/ColoredDiffViewer';
import { ChangeList } from './components/ChangeList';
import { INDONESIAN_SAMPLES } from './data/sampleTexts';
import {
  calculateDiffParts,
  generateChangeItems,
  calculateDiffSummary
} from './utils/diffHelper';
import {
  DiffGranularity,
  DiffViewMode,
  TextChangeItem
} from './types';

export default function App() {
  // --- STATE UNTUK TAB CLEANING (KODE ASLI) ---
  const defaultSample = INDONESIAN_SAMPLES[0];

  const savedOriginal = localStorage.getItem('app_original_text');
  const savedModified = localStorage.getItem('app_modified_text');

  const [originalText, setOriginalText] = useState<string>(
    savedOriginal || defaultSample.original
  );
  const [modifiedText, setModifiedText] = useState<string>(
    savedModified || defaultSample.modified
  );

  const [granularity, setGranularity] = useState<DiffGranularity>('words');
  const [viewMode, setViewMode] = useState<DiffViewMode>('unified');
  const [selectedChangeItem, setSelectedChangeItem] = useState<
    TextChangeItem | undefined
  >(undefined);

  useEffect(() => {
    localStorage.setItem('app_original_text', originalText);
  }, [originalText]);

  useEffect(() => {
    localStorage.setItem('app_modified_text', modifiedText);
  }, [modifiedText]);

  const diffParts = useMemo(() => {
    return calculateDiffParts(originalText, modifiedText, granularity);
  }, [originalText, modifiedText, granularity]);

  const { changeItems, annotatedParts } = useMemo(() => {
    return generateChangeItems(diffParts);
  }, [diffParts]);

  const summary = useMemo(() => {
    return calculateDiffSummary(originalText, modifiedText, annotatedParts);
  }, [originalText, modifiedText, annotatedParts]);

  // --- STATE UNTUK TAB ANALISIS & EVIDENCE ---
  const [activeTab, setActiveTab] = useState<'cleaning' | 'analysis'>('cleaning');
  
  // State baru untuk 2 file
  const [srtContent, setSrtContent] = useState<string>('');
  const [metadata, setMetadata] = useState<Record<string, any>>({});

  const [reviewSummary, setReviewSummary] = useState<string>('');
  const [evidenceList, setEvidenceList] = useState<any[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // State Quarantine
  const [quarantineList, setQuarantineList] = useState<any[]>([]);
  const [stats, setStats] = useState<{
    totalExtracted: number;
    duplicateRemoved: number;
    finalCount: number;
    quarantineCount: number;
  } | null>(null);

  // State Duplicate Removed
  const [duplicateRemovedDetails, setDuplicateRemovedDetails] = useState<any[]>([]);

  // --- HANDLERS UNTUK CLEANING ---
  const handleReset = () => {
    setOriginalText('');
    setModifiedText('');
    setSelectedChangeItem(undefined);
    localStorage.removeItem('app_original_text');
    localStorage.removeItem('app_modified_text');
  };

  const handleSwapText = () => {
    setOriginalText(modifiedText);
    setModifiedText(originalText);
    setSelectedChangeItem(undefined);
  };

  const handleOriginalChange = (val: string) => {
    setOriginalText(val);
  };

  const handleModifiedChange = (val: string) => {
    setModifiedText(val);
  };

  // --- HANDLER UNTUK UPLOAD FILE DI ANALISIS ---
  const handleFileUpload = (file: File, isMetadata: boolean) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (isMetadata) {
        try {
          // Parse JSON metadata
          const parsed = JSON.parse(content);
          setMetadata(parsed);
          setAnalysisError(null);
        } catch (err) {
          setAnalysisError('Format metadata.json tidak valid. Pastikan file berupa JSON yang benar.');
        }
      } else {
        // Teks SRT
        setSrtContent(content);
        setAnalysisError(null);
      }
    };
    reader.readAsText(file);
  };

  // --- HANDLER UNTUK ANALISIS (MENGIRIM 2 DATA KE SERVER) ---
  const handleAnalyze = async () => {
    if (!srtContent.trim()) {
      setAnalysisError('Silakan unggah / tempel konten transcript.srt terlebih dahulu.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);
    setReviewSummary('');
    setEvidenceList([]);
    setQuarantineList([]); // reset
    setStats(null);
    setDuplicateRemovedDetails([]);

    try {
      // Kirim metadata dan srtContent sekaligus!
      const response = await fetch('/api/analyze-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metadata, // Kirim objek JSON
          srtContent // Kirim string SRT
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Gagal memproses analisis.');
      }

      setReviewSummary(data.summary);
      setEvidenceList(data.evidence || []);
      setQuarantineList(data.quarantine || []); // simpan
      setStats(data.stats || null);
      setDuplicateRemovedDetails(data.duplicateRemoved || []);

    } catch (err: any) {
      console.error('Analysis Error:', err);
      setAnalysisError(err.message || 'Terjadi kesalahan pada server.');
    } finally {
      setIsAnalyzing(false);
    }
  };
  
  useEffect(() => {
    console.log('quarantineList:', quarantineList);
  }, [quarantineList]);

  // --- DOWNLOAD HANDLERS ---
  const downloadFile = (content: string, fileName: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadSummary = () => {
    if (reviewSummary) downloadFile(reviewSummary, 'review_summary.md', 'text/markdown');
  };

  const handleDownloadEvidence = () => {
    if (evidenceList.length > 0) {
      const jsonString = JSON.stringify(evidenceList, null, 2);
      downloadFile(jsonString, 'evidence_data.json', 'application/json');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col font-sans selection:bg-blue-100 selection:text-blue-900">
      <Header onReset={handleReset} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* --- NAVIGASI TAB --- */}
        <div className="flex items-center gap-4 border-b border-slate-300 pb-3">
          <button
            onClick={() => setActiveTab('cleaning')}
            className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors ${
              activeTab === 'cleaning'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            🧹 Koreksi STT (Text Cleaning)
          </button>
          <button
            onClick={() => setActiveTab('analysis')}
            className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors ${
              activeTab === 'analysis'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            📊 Analisis & Evidence
          </button>
        </div>

        {/* --- KONTEN TAB CLEANING (UTUH) --- */}
        {activeTab === 'cleaning' && (
          <div className="space-y-6">
            <TextInputs
              originalText={originalText}
              modifiedText={modifiedText}
              onOriginalChange={handleOriginalChange}
              onModifiedChange={handleModifiedChange}
              onSwapText={handleSwapText}
            />
            <div className="space-y-3 pt-2">
              <DiffToolbar granularity={granularity} onGranularityChange={setGranularity} viewMode={viewMode} onViewModeChange={setViewMode} totalChanges={summary.totalChanges} />
              <ChangeSummaryCards summary={summary} />
            </div>
            <div className="space-y-6">
              <ColoredDiffViewer parts={annotatedParts} viewMode={viewMode} selectedChangeItem={selectedChangeItem} onSelectChangeItem={setSelectedChangeItem} allChangeItems={changeItems} />
              <ChangeList changeItems={changeItems} selectedItem={selectedChangeItem} onSelectItem={setSelectedChangeItem} />
            </div>
          </div>
        )}

        {/* --- KONTEN TAB ANALISIS & EVIDENCE (DENGAN UPLOAD 2 FILE) --- */}
        {activeTab === 'analysis' && (
          <div className="space-y-4">
            {analysisError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800">
                ⚠️ {analysisError}
              </div>
            )}

            {(reviewSummary || evidenceList.length > 0) && (
              <div className="flex flex-wrap gap-3 pb-1">
                <button onClick={handleDownloadSummary} disabled={!reviewSummary} className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors disabled:opacity-50">
                  📥 Download Summary (.md)
                </button>
                <button onClick={handleDownloadEvidence} disabled={evidenceList.length === 0} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors disabled:opacity-50">
                  📥 Download Evidence (.json)
                </button>
                <h3 className="text-sm font-semibold text-slate-700">📊 Ringkasan Hasil Evidence</h3>
                  {/* Ringkasan Statistik */}
                  {stats && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-white p-4 rounded-xl border border-slate-300 shadow-xs">
                      {/* Detail Duplicate Removed */}
                      {duplicateRemovedDetails.length > 0 && (
                        <details className="bg-white border border-slate-300 rounded-xl p-3 shadow-xs">
                          <summary className="text-xs font-semibold text-red-700 cursor-pointer hover:text-red-800">
                            🗑️ Duplicate Dihapus ({duplicateRemovedDetails.length})
                          </summary>
                          <div className="mt-2 max-h-48 overflow-y-auto space-y-2">
                            {duplicateRemovedDetails.map((item, idx) => (
                              <div key={idx} className="border-b border-red-100 pb-2 last:border-0">
                                <div className="flex justify-between items-start gap-2">
                                  <span className="text-[10px] font-mono bg-red-200/70 px-1.5 py-0.5 rounded text-red-800">
                                    ID: {item.evidence_id}
                                  </span>
                                  <span className="text-[10px] text-red-600 italic text-right max-w-[60%]">
                                    {item.reason}
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-500 mt-0.5">
                                  Tetap mempertahankan: <strong>{item.kept_evidence_id}</strong>
                                </p>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}

                    </div>
                  )}
                  {evidenceList.length > 0 && stats && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-white p-4 rounded-xl border border-slate-300 shadow-xs">
                      <div>
                        <div className="text-xs text-slate-500">Total Evidence Diekstrak</div>
                        <div className="text-lg font-bold text-slate-800">{stats.totalExtracted}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Lolos Validasi</div>
                        <div className="text-lg font-bold text-emerald-600">{evidenceList.length}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Di-Quarantine</div>
                        <div className="text-lg font-bold text-amber-600">{quarantineList.length}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Duplicate Dihapus</div>
                        <div className="text-lg font-bold text-red-600">{stats.duplicateRemoved}</div>
                      </div>
                    </div>
                  )}

              </div>
            )}
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              
              {/* KOLOM 1: Input File SRT & METADATA */}
              <div className="bg-white border border-slate-300 rounded-xl shadow-xs p-4 flex flex-col min-h-[300px]">
                <h3 className="text-sm font-bold text-slate-800 mb-2">1. Upload File</h3>
                
                {/* Upload SRT */}
                <div className="mb-3">
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">📄 Transcript (transcript.srt)</label>
                  <div className="relative border border-dashed border-slate-300 rounded-lg p-2 hover:bg-slate-50 transition-colors">
                    <input
                      type="file"
                      accept=".srt,.txt"
                      onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], false)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="bg-slate-200 px-2 py-0.5 rounded">Choose file</span>
                      <span className="truncate max-w-[200px]">{srtContent ? '✅ File SRT dimuat' : 'Belum ada file'}</span>
                    </div>
                  </div>
                </div>

                {/* Upload METADATA JSON */}
                <div className="mb-3">
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">📦 Metadata (metadata.json)</label>
                  <div className="relative border border-dashed border-slate-300 rounded-lg p-2 hover:bg-slate-50 transition-colors">
                    <input
                      type="file"
                      accept=".json"
                      onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], true)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="bg-slate-200 px-2 py-0.5 rounded">Choose file</span>
                      <span className="truncate max-w-[200px]">{metadata.channel ? `✅ ${metadata.channel} dimuat` : 'Belum ada file'}</span>
                    </div>
                  </div>
                  
                  {/* Preview Metadata jika sudah diupload */}
                  {metadata.channel && (
                    <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-100 text-xs space-y-0.5">
                      <p className="font-bold text-blue-700 truncate">{metadata.title || 'No Title'}</p>
                      <p className="text-slate-500">Channel: {metadata.channel}</p>
                      {metadata.uploadDate && <p className="text-slate-500 text-[10px]">📅 {metadata.uploadDate}</p>}
                    </div>
                  )}
                </div>

                {/* Tombol Jalankan */}
                <button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || !srtContent.trim()}
                  className="mt-auto w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAnalyzing ? '⏳ Menganalisis...' : '🚀 Jalankan Analisis'}
                </button>
              </div>

              {/* KOLOM 2: Review Summary */}
              <div className="bg-white border border-slate-300 rounded-xl shadow-xs p-4 flex flex-col min-h-[300px]">
                <h3 className="text-sm font-bold text-slate-800 mb-2">2. Review Summary</h3>
                <div className="flex-1 bg-slate-50 p-3 rounded-lg border border-slate-200 overflow-y-auto text-xs text-slate-700 whitespace-pre-wrap min-h-[200px]">
                  {isAnalyzing ? (
                    <div className="text-slate-400 italic animate-pulse">Sedang membuat ringkasan...</div>
                  ) : reviewSummary ? (
                    reviewSummary
                  ) : (
                    <span className="text-slate-400 italic">Hasil Summary AI akan muncul di sini.</span>
                  )}
                </div>
              </div>

              {/* KOLOM 3: Evidence Extraction */}
              <div className="bg-white border border-slate-300 rounded-xl shadow-xs p-4 flex flex-col min-h-[300px]">
                <h3 className="text-sm font-bold text-slate-800 mb-2">3. Evidence (Dengan Timestamp)</h3>
                <div className="flex-1 bg-slate-50 p-3 rounded-lg border border-slate-200 overflow-y-auto text-xs text-slate-700 min-h-[200px]">
                  {isAnalyzing ? (
                    <div className="text-slate-400 italic animate-pulse">Mengekstrak bukti & timestamp...</div>
                  ) : evidenceList.length > 0 ? (
                    <div className="space-y-3">
                      {evidenceList.map((ev, idx) => (
                        <div key={idx} className="bg-white p-2 rounded border border-slate-200 shadow-2xs">
                          <div className="flex justify-between items-start gap-2 mb-1">
                            <span className="font-bold text-blue-700 uppercase text-[10px]">{ev.topic}</span>
                            <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              {ev.timestamp_start || '00:00:00'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-800 leading-tight mb-1">"{ev.claim}"</p>
                          <p className="text-[10px] text-slate-400 italic truncate">Source: {ev.source}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-400 italic">JSON Evidence dengan Timestamp akan muncul di sini.</span>
                  )}
                </div>
                {/* --- TAMBAHKAN BAGIAN QUARANTINE DI SINI --- */}
                {Array.isArray(quarantineList) && quarantineList.length > 0 && (
                  <details className="mt-3 border-t border-slate-200 pt-3" open>
                    <summary className="text-xs font-semibold text-amber-700 cursor-pointer hover:text-amber-800 flex items-center gap-1">
                      ⚠️ Evidence di-Quarantine ({quarantineList.length})
                    </summary>
                    <div className="mt-2 max-h-48 overflow-y-auto space-y-2 bg-amber-50 p-2 rounded border border-amber-200">
                      {quarantineList.map((item, idx) => {
                        // Jika item adalah string, tampilkan sebagai alasan saja
                        if (typeof item === 'string') {
                          return (
                            <div key={idx} className="border-b border-amber-100 pb-2 last:border-0">
                              <div className="flex justify-between items-start gap-2">
                                <span className="text-[10px] font-mono bg-amber-200/70 px-1.5 py-0.5 rounded text-amber-800">
                                  Item #{idx + 1}
                                </span>
                                <span className="text-[10px] text-amber-600 italic break-words text-right max-w-[60%]">
                                  {item}
                                </span>
                              </div>
                            </div>
                          );
                        }

                        // Jika item adalah object, tampilkan detail
                        const reason = item.reason || 'Alasan tidak diketahui';
                        const chunkLabel = (item.chunkIndex !== undefined && item.chunkIndex !== null)
                          ? `Chunk #${item.chunkIndex + 1}`
                          : `Item #${idx + 1}`;
                        const evidence = item.evidence || {};

                        return (
                          <div key={idx} className="border-b border-amber-100 pb-2 last:border-0">
                            <div className="flex justify-between items-start gap-2">
                              <span className="text-[10px] font-mono bg-amber-200/70 px-1.5 py-0.5 rounded text-amber-800">
                                {chunkLabel}
                              </span>
                              <span className="text-[10px] text-amber-600 italic break-words text-right max-w-[60%]">
                                {reason}
                              </span>
                            </div>
                            
                            {evidence.claim && (
                              <p className="text-[11px] text-slate-700 mt-1">
                                <span className="font-semibold">Claim:</span> {evidence.claim}
                              </p>
                            )}
                            {evidence.source_excerpt && (
                              <p className="text-[10px] text-slate-500 italic mt-0.5 truncate">
                                <span className="font-medium">Excerpt:</span> "{evidence.source_excerpt}"
                              </p>
                            )}
                            {evidence.evidence_id && (
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                ID: {evidence.evidence_id}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </details>
                )}
              </div>

            </div>
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 py-4 mt-8 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4">
          Analisa Perubahan Teks — Membandingkan Teks Original dan Modifikasi dengan Penandaan Warna Interaktif
        </div>
      </footer>
    </div>
  );
}

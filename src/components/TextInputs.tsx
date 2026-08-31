import React, { useState, useRef, useEffect } from 'react';
import {
  Copy,
  Trash2,
  ArrowLeftRight,
  Check,
  Edit3,
  Upload,
  FileUp,
  FileText,
  X,
  AlertCircle,
  Sparkles,
  Loader2,
  Wand2,
  PlusCircle,
  ChevronRight, // Icon untuk membuka panel
  ChevronLeft   // Icon untuk menutup panel
} from 'lucide-react';
import { countWords, countLines } from '../utils/diffHelper';

interface TextInputsProps {
  originalText: string;
  modifiedText: string;
  onOriginalChange: (val: string) => void;
  onModifiedChange: (val: string) => void;
  onSwapText: () => void;
}

export const TextInputs: React.FC<TextInputsProps> = ({
  originalText,
  modifiedText,
  onOriginalChange,
  onModifiedChange,
  onSwapText
}) => {
  // ... [Semua State yang ada tetap sama] ...
  const [copiedOriginal, setCopiedOriginal] = useState(false);
  const [copiedModified, setCopiedModified] = useState(false);
  const [fileOriginalName, setFileOriginalName] = useState<string | null>(null);
  const [fileModifiedName, setFileModifiedName] = useState<string | null>(null);
  const [isDraggingOriginal, setIsDraggingOriginal] = useState(false);
  const [isDraggingModified, setIsDraggingModified] = useState(false);
  const [uploadErrorOriginal, setUploadErrorOriginal] = useState<string | null>(null);
  const [uploadErrorModified, setUploadErrorModified] = useState<string | null>(null);

  const [isCorrecting, setIsCorrecting] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [lastAiModeUsed, setLastAiModeUsed] = useState<string | null>(null);

  const [templates, setTemplates] = useState<{id: string, name: string}[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [customManualPrompt, setCustomManualPrompt] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);

  // 🔥 TAMBAHAN: State untuk Collapse Panel AI
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const fileInputOriginalRef = useRef<HTMLInputElement>(null);
  const fileInputModifiedRef = useRef<HTMLInputElement>(null);

  // ... [useEffect & Semua Fungsi Helper (handleFileUpload, readFileAsText, drag-drop) tetap sama] ...
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const res = await fetch('/api/templates');
        if (res.ok) {
          const data = await res.json();
          setTemplates(data);
        }
      } catch (err) {
        console.error("Gagal mengambil template AI", err);
      }
    };
    fetchTemplates();
  }, []);

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string) || '');
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  };

  const handleFileUpload = async (file: File, setText: (val: string) => void, setFileName: (name: string | null) => void, setError: (err: string | null) => void) => {
    setError(null);
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('Ukuran file terlalu besar (maksimal 10MB)');
      return;
    }
    try {
      const content = await readFileAsText(file);
      setText(content);
      setFileName(file.name);
    } catch {
      setError('Gagal membaca file. Pastikan file berupa file teks.');
    }
  };

  const handleCopyOriginal = () => {
    if (!originalText) return;
    navigator.clipboard.writeText(originalText);
    setCopiedOriginal(true);
    setTimeout(() => setCopiedOriginal(false), 2000);
  };

  const handleCopyModified = () => {
    if (!modifiedText) return;
    navigator.clipboard.writeText(modifiedText);
    setCopiedModified(true);
    setTimeout(() => setCopiedModified(false), 2000);
  };

  const handleClearOriginal = () => {
    onOriginalChange('');
    setFileOriginalName(null);
    setUploadErrorOriginal(null);
  };

  const handleClearModified = () => {
    onModifiedChange('');
    setFileModifiedName(null);
    setUploadErrorModified(null);
    setLastAiModeUsed(null);
  };

  const handleAiCorrection = async () => {
    if (!originalText.trim()) {
      setAiError('Silakan isi atau unggah Teks Original (Textbox 1) terlebih dahulu.');
      return;
    }

    setAiError(null);
    setIsCorrecting(true);

    try {
      let mode = 'grammar';
      let templateId = null;
      let customInstruction = null;

      if (isCustomMode) {
        mode = 'custom';
        customInstruction = customManualPrompt;
      } else if (selectedTemplateId) {
        mode = 'template';
        templateId = selectedTemplateId;
      } else {
        mode = 'template';
        templateId = templates[0]?.id || 'grammar';
      }

      const response = await fetch('/api/correct-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: originalText,
          mode,
          templateId,
          customInstruction
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Terjadi kesalahan saat memproses koreksi AI.');
      }

      onModifiedChange(data.correctedText);
      const selectedTemplateName = templates.find(t => t.id === templateId)?.name || 'Mode Cepat';
      setLastAiModeUsed(isCustomMode ? 'Instruksi Manual' : selectedTemplateName);

    } catch (err: any) {
      console.error('AI Correction Error:', err);
      setAiError(err.message || 'Gagal menghubungkan ke server AI. Coba lagi.');
    } finally {
      setIsCorrecting(false);
    }
  };

  // ... [Drag & drop handlers tetap sama] ...
  const handleDragOverOriginal = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDraggingOriginal(true); };
  const handleDragLeaveOriginal = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDraggingOriginal(false); };
  const handleDropOriginal = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDraggingOriginal(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFileUpload(e.dataTransfer.files[0], onOriginalChange, setFileOriginalName, setUploadErrorOriginal);
  };
  const handleDragOverModified = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDraggingModified(true); };
  const handleDragLeaveModified = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDraggingModified(false); };
  const handleDropModified = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDraggingModified(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFileUpload(e.dataTransfer.files[0], onModifiedChange, setFileModifiedName, setUploadErrorModified);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
          <Edit3 className="w-4 h-4 text-blue-600" />
          Input Teks Banding
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={onSwapText} disabled={!originalText && !modifiedText} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs">
            <ArrowLeftRight className="w-3.5 h-3.5" />
            Tukar Teks Original ↔ Modifikasi
          </button>
        </div>
      </div>

      {aiError && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{aiError}</span>
          </div>
          <button onClick={() => setAiError(null)} className="p-1 hover:bg-red-100 rounded text-red-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 🔥 PERUBAHAN UTAMA: Ubah Grid menjadi Flexbox */}
      <div className="flex flex-col lg:flex-row gap-4">
        
        {/* Kolom 1: Teks Original (Akan melebar otomatis) */}
        <div className="flex-1 min-w-0">
          <div onDragOver={handleDragOverOriginal} onDragLeave={handleDragLeaveOriginal} onDrop={handleDropOriginal} className={`relative flex flex-col bg-white border rounded-xl shadow-xs overflow-hidden transition-all ${isDraggingOriginal ? 'border-blue-500 ring-2 ring-blue-200 bg-blue-50/20' : 'border-slate-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100'}`}>
            {/* ... [Konten Textbox 1 tetap sama persis seperti kode Anda] ... */}
            <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50 border-b border-slate-200">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400 shrink-0" />
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider truncate">Textbox 1: Teks Original</label>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <input ref={fileInputOriginalRef} type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) { handleFileUpload(e.target.files[0], onOriginalChange, setFileOriginalName, setUploadErrorOriginal); e.target.value = ''; } }} />
                <button onClick={() => fileInputOriginalRef.current?.click()} className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-md transition-colors shadow-2xs">
                  <Upload className="w-3.5 h-3.5 text-blue-600" />
                  <span className="hidden sm:inline">Upload</span>
                </button>
                <button onClick={handleCopyOriginal} disabled={!originalText} className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-md transition-colors disabled:opacity-40">
                  {copiedOriginal ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button onClick={handleClearOriginal} disabled={!originalText && !fileOriginalName} className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-40">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {fileOriginalName && originalText && (<div className="flex items-center justify-between px-3.5 py-1.5 bg-blue-50/70 border-b border-blue-100 text-xs text-blue-800 font-medium"><div className="flex items-center gap-1.5 truncate"><FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" /><span className="truncate">File: {fileOriginalName}</span></div><button onClick={() => setFileOriginalName(null)} className="p-0.5 hover:bg-blue-100 rounded text-blue-600 hover:text-blue-900"><X className="w-3 h-3" /></button></div>)}
            {uploadErrorOriginal && (<div className="flex items-center gap-1.5 px-3.5 py-1.5 bg-red-50 border-b border-red-100 text-xs text-red-700 font-medium"><AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" /><span className="truncate">{uploadErrorOriginal}</span></div>)}
            <div className="relative flex-1 min-h-[220px] sm:min-h-[260px]">
              {isDraggingOriginal && (<div className="absolute inset-0 bg-blue-500/10 backdrop-blur-xs border-2 border-dashed border-blue-500 rounded-b-xl flex flex-col items-center justify-center text-blue-700 z-10 p-4 transition-all pointer-events-none"><FileUp className="w-10 h-10 mb-2 text-blue-600 animate-bounce" /><p className="font-semibold text-sm text-center">Lepaskan file di sini</p><p className="text-xs text-blue-500 mt-1">Format teks (.txt, .md, .csv)</p></div>)}
              <textarea value={originalText} onChange={(e) => { onOriginalChange(e.target.value); if (uploadErrorOriginal) setUploadErrorOriginal(null); if (aiError) setAiError(null); }} placeholder="Tempel, ketik, atau seret file ke sini..." className="w-full h-full p-4 text-sm text-slate-800 placeholder-slate-400 bg-transparent resize-y focus:outline-hidden font-sans leading-relaxed min-h-[220px] sm:min-h-[260px]" />
            </div>
            <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-t border-slate-100 text-xs font-medium text-slate-600"><div className="flex items-center gap-3"><span><strong className="text-slate-900">{countWords(originalText)}</strong> kata</span><span><strong className="text-slate-900">{originalText.length}</strong> karakter</span><span><strong className="text-slate-900">{countLines(originalText)}</strong> baris</span></div><span className="text-slate-400 text-[11px]">Teks Sumber #1</span></div>
          </div>
        </div>

        {/* Kolom 2: Teks Modifikasi (Akan melebar otomatis) */}
        <div className="flex-1 min-w-0">
          <div onDragOver={handleDragOverModified} onDragLeave={handleDragLeaveModified} onDrop={handleDropModified} className={`relative flex flex-col bg-white border rounded-xl shadow-xs overflow-hidden transition-all ${isDraggingModified ? 'border-blue-500 ring-2 ring-blue-200 bg-blue-50/20' : 'border-slate-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100'}`}>
             {/* ... [Konten Textbox 2 tetap sama persis seperti kode Anda] ... */}
             <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50 border-b border-slate-200">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider truncate">Textbox 2: Teks Modifikasi</label>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <input ref={fileInputModifiedRef} type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) { handleFileUpload(e.target.files[0], onModifiedChange, setFileModifiedName, setUploadErrorModified); e.target.value = ''; } }} />
                <button onClick={() => fileInputModifiedRef.current?.click()} className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-md transition-colors shadow-2xs">
                  <Upload className="w-3.5 h-3.5 text-blue-600" />
                  <span className="hidden sm:inline">Upload</span>
                </button>
                <button onClick={handleCopyModified} disabled={!modifiedText} className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-md transition-colors disabled:opacity-40">
                  {copiedModified ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button onClick={handleClearModified} disabled={!modifiedText && !fileModifiedName} className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-40">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {fileModifiedName && modifiedText && (<div className="flex items-center justify-between px-3.5 py-1.5 bg-blue-50/70 border-b border-blue-100 text-xs text-blue-800 font-medium"><div className="flex items-center gap-1.5 truncate"><FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" /><span className="truncate">File: {fileModifiedName}</span></div><button onClick={() => setFileModifiedName(null)} className="p-0.5 hover:bg-blue-100 rounded text-blue-600 hover:text-blue-900"><X className="w-3 h-3" /></button></div>)}
            {lastAiModeUsed && modifiedText && (<div className="flex items-center justify-between px-3.5 py-1.5 bg-emerald-50 border-b border-emerald-100 text-xs text-emerald-800 font-medium"><div className="flex items-center gap-1.5 truncate"><Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" /><span className="truncate">Hasil Koreksi AI ({lastAiModeUsed})</span></div><button onClick={() => setLastAiModeUsed(null)} className="p-0.5 hover:bg-emerald-100 rounded text-emerald-700"><X className="w-3 h-3" /></button></div>)}
            {uploadErrorModified && (<div className="flex items-center gap-1.5 px-3.5 py-1.5 bg-red-50 border-b border-red-100 text-xs text-red-700 font-medium"><AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" /><span className="truncate">{uploadErrorModified}</span></div>)}
            <div className="relative flex-1 min-h-[220px] sm:min-h-[260px]">
              {isDraggingModified && (<div className="absolute inset-0 bg-blue-500/10 backdrop-blur-xs border-2 border-dashed border-blue-500 rounded-b-xl flex flex-col items-center justify-center text-blue-700 z-10 p-4 transition-all pointer-events-none"><FileUp className="w-10 h-10 mb-2 text-blue-600 animate-bounce" /><p className="font-semibold text-sm text-center">Lepaskan file di sini</p><p className="text-xs text-blue-500 mt-1">Format teks (.txt, .md, .csv)</p></div>)}
              <textarea value={modifiedText} onChange={(e) => { onModifiedChange(e.target.value); if (uploadErrorModified) setUploadErrorModified(null); }} placeholder="Hasil koreksi AI atau tempel manual teks target..." className="w-full h-full p-4 text-sm text-slate-800 placeholder-slate-400 bg-transparent resize-y focus:outline-hidden font-sans leading-relaxed min-h-[220px] sm:min-h-[260px]" />
            </div>
            <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-t border-slate-100 text-xs font-medium text-slate-600"><div className="flex items-center gap-3"><span><strong className="text-slate-900">{countWords(modifiedText)}</strong> kata</span><span><strong className="text-slate-900">{modifiedText.length}</strong> karakter</span><span><strong className="text-slate-900">{countLines(modifiedText)}</strong> baris</span></div><span className="text-slate-400 text-[11px]">Teks Target #2</span></div>
          </div>
        </div>

        {/* 🔥 Kolom 3: Panel Kontrol AI (Collapsible dengan Animasi) */}
        <div 
          className={`flex flex-col bg-white border border-slate-300 rounded-xl shadow-xs transition-all duration-300 ease-in-out overflow-hidden ${
            isSidebarOpen ? 'w-full lg:w-[340px]' : 'w-full lg:w-12'
          }`}
        >
          {/* Header Panel */}
          <div className="px-3.5 py-2.5 bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-blue-50/90 border-b border-blue-100 flex items-center justify-between gap-2 shrink-0">
            <div className={`flex items-center gap-1.5 min-w-0 ${!isSidebarOpen && 'hidden'}`}>
              <div className="p-1 bg-blue-600 text-white rounded-md shadow-xs"><Sparkles className="w-3.5 h-3.5" /></div>
              <span className="text-xs font-semibold text-slate-800">Koreksi AI</span>
            </div>
            
            {/* Tombol Toggle Collapse */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-1.5 hover:bg-slate-200 rounded-md transition-colors text-slate-500 hover:text-slate-800 ml-auto"
              title={isSidebarOpen ? 'Sembunyikan Panel AI' : 'Tampilkan Panel AI'}
            >
              {isSidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>

          {/* Isi Panel (Hanya muncul jika Open) */}
          {isSidebarOpen ? (
            <div className="flex-1 p-3 sm:p-4 flex flex-col gap-4 overflow-y-auto max-h-[500px]">
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Daftar Template Tersedia</span>
                <div className="flex flex-wrap gap-1.5">
                  {templates.map((template) => {
                    const isSelected = selectedTemplateId === template.id && !isCustomMode;
                    return (
                      <button
                        key={template.id}
                        onClick={() => { setSelectedTemplateId(template.id); setIsCustomMode(false); }}
                        className={`text-[10px] px-2 py-1.5 rounded-lg border font-medium transition-colors ${
                          isSelected ? 'bg-blue-600 border-blue-600 text-white shadow-xs' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {template.name}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
                  <button
                    onClick={() => setIsCustomMode(!isCustomMode)}
                    className={`flex items-center gap-1.5 text-[10px] px-2 py-1.5 rounded-lg border font-medium transition-colors w-fit ${
                      isCustomMode ? 'bg-amber-50 border-amber-400 text-amber-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    <PlusCircle className="w-3 h-3" />
                    {isCustomMode ? '✖ Batal Mode Manual' : 'Instruksi Manual (Dadakan)'}
                  </button>

                  {isCustomMode && (
                    <div className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-1">
                      <textarea
                        value={customManualPrompt}
                        onChange={(e) => setCustomManualPrompt(e.target.value)}
                        placeholder="Tulis prompt instan Anda di sini..."
                        className="w-full px-2 py-1.5 text-[11px] border border-slate-300 rounded focus:outline-hidden focus:border-amber-500 resize-y min-h-[60px] bg-amber-50/30"
                      />
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={handleAiCorrection}
                disabled={isCorrecting || !originalText.trim() || (isCustomMode && !customManualPrompt.trim())}
                className={`flex items-center justify-center gap-2 w-full py-2 text-xs font-semibold text-white rounded-lg shadow-xs transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none mt-auto ${
                  isCustomMode ? 'bg-amber-600 hover:bg-amber-700' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'
                }`}
              >
                {isCorrecting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Mengoreksi Teks Original...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>Terapkan Koreksi</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            // Saat Panel Collapsed, kita beri ruang kosong agar tombol buka tetap rapi di tengah.
            // `flex-1` di sini akan memastikan tombol ikon berada di tengah vertikal panel.
            <div className="flex-1 flex items-center justify-center py-2">
              {/* Area kosong, atau bisa menampilkan ikon besar */}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
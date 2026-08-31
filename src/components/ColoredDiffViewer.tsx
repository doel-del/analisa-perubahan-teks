import React, { useEffect, useRef } from 'react';
import {
  Sparkles,
  X,
  Eye,
  Columns,
  SquareDashed,
  ArrowRight
} from 'lucide-react';
import { DiffPart, DiffViewMode, TextChangeItem } from '../types';

interface ColoredDiffViewerProps {
  parts: DiffPart[];
  viewMode: DiffViewMode;
  selectedChangeItem?: TextChangeItem;
  onSelectChangeItem?: (item: TextChangeItem | undefined) => void;
  allChangeItems: TextChangeItem[];
}

export const ColoredDiffViewer: React.FC<ColoredDiffViewerProps> = ({
  parts,
  viewMode,
  selectedChangeItem,
  onSelectChangeItem,
  allChangeItems
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Smooth scroll to the highlighted diff element when selectedChangeItem changes
  useEffect(() => {
    if (!selectedChangeItem || !containerRef.current) return;

    // Try to find the element with data-change-index
    const el = containerRef.current.querySelector(
      `[data-change-index="${selectedChangeItem.index}"]`
    );
    if (el) {
      el.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center'
      });
    }
  }, [selectedChangeItem]);

  // Helper to find change item by changeIndex
  const getChangeItemByIndex = (index?: number): TextChangeItem | undefined => {
    if (index === undefined) return undefined;
    return allChangeItems.find((item) => item.index === index);
  };

  const isPartSelected = (part: DiffPart): boolean => {
    if (!selectedChangeItem || !part.changeIndex) return false;
    return selectedChangeItem.index === part.changeIndex;
  };

  const handlePartClick = (part: DiffPart) => {
    if (!part.changeIndex || !onSelectChangeItem) return;
    const item = getChangeItemByIndex(part.changeIndex);
    if (item) {
      if (selectedChangeItem?.id === item.id) {
        onSelectChangeItem(undefined); // toggle off
      } else {
        onSelectChangeItem(item);
      }
    }
  };

  // Split view filtering
  const originalParts = parts.filter((p) => !p.added);
  const modifiedParts = parts.filter((p) => !p.removed);

  return (
    <div
      ref={containerRef}
      className="bg-white border border-slate-300 rounded-xl shadow-xs overflow-hidden transition-all"
    >
      {/* Viewer Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold tracking-tight">
            Teks yang Diwarnai (Visual Diff Viewer)
          </h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-medium">
            {viewMode === 'unified'
              ? 'Satu Panel (Unified)'
              : 'Dua Kolom (Original vs Modifikasi)'}
          </span>
        </div>

        {/* Legend */}
        <div className="hidden sm:flex items-center gap-4 text-xs font-medium">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-3 h-3 rounded-xs bg-emerald-500/30 border border-emerald-400" />
            Ditambahkan (+)
          </span>
          <span className="flex items-center gap-1.5 text-rose-400">
            <span className="w-3 h-3 rounded-xs bg-rose-500/30 border border-rose-400" />
            Dihapus (-)
          </span>
          <span className="text-slate-400">|</span>
          <span className="text-slate-300 text-[11px]">
            💡 Klik sorotan warna untuk detail
          </span>
        </div>
      </div>

      {/* Selected Change Banner indicator */}
      {selectedChangeItem && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm text-amber-900">
            <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white font-extrabold text-xs">
              #{selectedChangeItem.index}
            </span>
            <span className="font-semibold">{selectedChangeItem.description}</span>
          </div>

          <button
            onClick={() => onSelectChangeItem && onSelectChangeItem(undefined)}
            className="flex items-center gap-1 text-xs font-semibold text-amber-800 hover:text-amber-950 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-md transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
            Tutup Sorotan
          </button>
        </div>
      )}

      {/* Viewer Body */}
      <div className="p-4 sm:p-6 font-sans text-sm sm:text-base leading-relaxed text-slate-800 max-h-[480px] overflow-y-auto">
        {viewMode === 'unified' ? (
          /* UNIFIED VIEW (Single Column) */
          <div className="whitespace-pre-wrap break-words leading-loose">
            {parts.map((part) => {
              const selected = isPartSelected(part);
              const isChange = part.added || part.removed;

              if (part.added) {
                return (
                  <span
                    key={part.id}
                    data-change-index={part.changeIndex}
                    onClick={() => handlePartClick(part)}
                    className={`inline-block px-1.5 py-0.5 my-0.5 rounded-md font-medium cursor-pointer transition-all ${
                      selected
                        ? 'bg-amber-300 text-amber-950 ring-2 ring-amber-500 scale-105 shadow-md font-bold z-10'
                        : 'bg-emerald-100 text-emerald-950 border border-emerald-300/80 hover:bg-emerald-200'
                    }`}
                    title={
                      part.changeIndex
                        ? `Perubahan #${part.changeIndex} (Ditambahkan) - Klik untuk detail`
                        : 'Ditambahkan'
                    }
                  >
                    {part.changeIndex && (
                      <sup className="text-[10px] font-bold text-emerald-700 mr-0.5 select-none">
                        #{part.changeIndex}
                      </sup>
                    )}
                    {part.value}
                  </span>
                );
              }

              if (part.removed) {
                return (
                  <span
                    key={part.id}
                    data-change-index={part.changeIndex}
                    onClick={() => handlePartClick(part)}
                    className={`inline-block px-1.5 py-0.5 my-0.5 rounded-md font-medium cursor-pointer transition-all line-through ${
                      selected
                        ? 'bg-amber-300 text-amber-950 ring-2 ring-amber-500 scale-105 shadow-md font-bold z-10'
                        : 'bg-rose-100 text-rose-950 border border-rose-300/80 hover:bg-rose-200'
                    }`}
                    title={
                      part.changeIndex
                        ? `Perubahan #${part.changeIndex} (Dihapus) - Klik untuk detail`
                        : 'Dihapus'
                    }
                  >
                    {part.changeIndex && (
                      <sup className="text-[10px] font-bold text-rose-700 mr-0.5 select-none">
                        #{part.changeIndex}
                      </sup>
                    )}
                    {part.value}
                  </span>
                );
              }

              return <span key={part.id}>{part.value}</span>;
            })}
          </div>
        ) : (
          /* SPLIT VIEW (Two Columns: Original vs Modified) */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
            {/* Left Column: Teks Original */}
            <div className="pr-0 lg:pr-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center justify-between">
                <span>Kolom 1: Teks Original (Asli)</span>
                <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md">
                  Menampilkan teks dihapus (-)
                </span>
              </div>
              <div className="whitespace-pre-wrap break-words leading-loose">
                {originalParts.map((part) => {
                  const selected = isPartSelected(part);
                  if (part.removed) {
                    return (
                      <span
                        key={part.id}
                        data-change-index={part.changeIndex}
                        onClick={() => handlePartClick(part)}
                        className={`inline-block px-1.5 py-0.5 my-0.5 rounded-md font-medium cursor-pointer transition-all line-through ${
                          selected
                            ? 'bg-amber-300 text-amber-950 ring-2 ring-amber-500 scale-105 shadow-md font-bold z-10'
                            : 'bg-rose-100 text-rose-950 border border-rose-300/80 hover:bg-rose-200'
                        }`}
                        title={`Perubahan #${part.changeIndex} (Dihapus)`}
                      >
                        {part.changeIndex && (
                          <sup className="text-[10px] font-bold text-rose-700 mr-0.5 select-none">
                            #{part.changeIndex}
                          </sup>
                        )}
                        {part.value}
                      </span>
                    );
                  }
                  return <span key={part.id}>{part.value}</span>;
                })}
              </div>
            </div>

            {/* Right Column: Teks Modifikasi */}
            <div className="pt-4 lg:pt-0 pl-0 lg:pl-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center justify-between">
                <span>Kolom 2: Teks Modifikasi (Revisi)</span>
                <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                  Menampilkan teks ditambahkan (+)
                </span>
              </div>
              <div className="whitespace-pre-wrap break-words leading-loose">
                {modifiedParts.map((part) => {
                  const selected = isPartSelected(part);
                  if (part.added) {
                    return (
                      <span
                        key={part.id}
                        data-change-index={part.changeIndex}
                        onClick={() => handlePartClick(part)}
                        className={`inline-block px-1.5 py-0.5 my-0.5 rounded-md font-medium cursor-pointer transition-all ${
                          selected
                            ? 'bg-amber-300 text-amber-950 ring-2 ring-amber-500 scale-105 shadow-md font-bold z-10'
                            : 'bg-emerald-100 text-emerald-950 border border-emerald-300/80 hover:bg-emerald-200'
                        }`}
                        title={`Perubahan #${part.changeIndex} (Ditambahkan)`}
                      >
                        {part.changeIndex && (
                          <sup className="text-[10px] font-bold text-emerald-700 mr-0.5 select-none">
                            #{part.changeIndex}
                          </sup>
                        )}
                        {part.value}
                      </span>
                    );
                  }
                  return <span key={part.id}>{part.value}</span>;
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
        <span>
          💡 <strong>Tip Interaktif:</strong> Klik pada teks berwarna hijau (+)
          atau merah (-) di atas untuk menyorot keterangan perubahannya di tabel
          bawah.
        </span>
        <span className="text-slate-400">Total {allChangeItems.length} poin perubahan</span>
      </div>
    </div>
  );
};

import React from 'react';
import {
  Layers,
  Columns,
  SquareDashed,
  SlidersHorizontal
} from 'lucide-react';
import { DiffGranularity, DiffViewMode } from '../types';

interface DiffToolbarProps {
  granularity: DiffGranularity;
  onGranularityChange: (g: DiffGranularity) => void;
  viewMode: DiffViewMode;
  onViewModeChange: (m: DiffViewMode) => void;
  totalChanges: number;
}

export const DiffToolbar: React.FC<DiffToolbarProps> = ({
  granularity,
  onGranularityChange,
  viewMode,
  onViewModeChange,
  totalChanges
}) => {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3 shadow-2xs">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mr-1">
          <SlidersHorizontal className="w-4 h-4 text-blue-600" />
          <span>Analisis Per:</span>
        </div>

        <div className="flex bg-slate-200/80 p-0.5 rounded-lg">
          <button
            onClick={() => onGranularityChange('words')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
              granularity === 'words'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Kata (Words)
          </button>
          <button
            onClick={() => onGranularityChange('lines')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
              granularity === 'lines'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Baris (Lines)
          </button>
          <button
            onClick={() => onGranularityChange('chars')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
              granularity === 'chars'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Karakter (Chars)
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
        <div className="flex items-center gap-1 text-xs text-slate-600">
          <span className="font-semibold text-slate-900">{totalChanges}</span>{' '}
          titik perubahan
        </div>

        <div className="flex items-center gap-1 bg-slate-200/80 p-0.5 rounded-lg">
          <button
            onClick={() => onViewModeChange('unified')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
              viewMode === 'unified'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Tampilkan teks warna dalam satu panel terintegrasi"
          >
            <SquareDashed className="w-3.5 h-3.5" />
            <span>Satu Panel</span>
          </button>
          <button
            onClick={() => onViewModeChange('split')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
              viewMode === 'split'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Tampilkan teks warna original dan modifikasi bersandingan (dua kolom)"
          >
            <Columns className="w-3.5 h-3.5" />
            <span>Berdampingan</span>
          </button>
        </div>
      </div>
    </div>
  );
};

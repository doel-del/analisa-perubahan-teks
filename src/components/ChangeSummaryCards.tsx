import React from 'react';
import {
  Percent,
  PlusCircle,
  MinusCircle,
  Activity,
  BarChart2
} from 'lucide-react';
import { DiffSummary } from '../types';

interface ChangeSummaryCardsProps {
  summary: DiffSummary;
}

export const ChangeSummaryCards: React.FC<ChangeSummaryCardsProps> = ({
  summary
}) => {
  const isHighSimilarity = summary.similarityPercent >= 80;
  const isMediumSimilarity =
    summary.similarityPercent >= 50 && summary.similarityPercent < 80;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {/* Card 1: Similarity % */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs flex items-center gap-3">
        <div
          className={`p-2.5 rounded-lg flex items-center justify-center ${
            isHighSimilarity
              ? 'bg-emerald-100 text-emerald-700'
              : isMediumSimilarity
              ? 'bg-amber-100 text-amber-700'
              : 'bg-rose-100 text-rose-700'
          }`}
        >
          <Percent className="w-5 h-5" />
        </div>
        <div>
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
            Kesamaan Teks
          </span>
          <div className="flex items-baseline gap-1">
            <span
              className={`text-xl font-extrabold ${
                isHighSimilarity
                  ? 'text-emerald-700'
                  : isMediumSimilarity
                  ? 'text-amber-700'
                  : 'text-rose-700'
              }`}
            >
              {summary.similarityPercent}%
            </span>
            <span className="text-xs text-slate-400">mirip</span>
          </div>
        </div>
      </div>

      {/* Card 2: Total Changes */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs flex items-center gap-3">
        <div className="p-2.5 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
          <Activity className="w-5 h-5" />
        </div>
        <div>
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
            Titik Perubahan
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-extrabold text-slate-900">
              {summary.totalChanges}
            </span>
            <span className="text-xs text-slate-400">bagian</span>
          </div>
        </div>
      </div>

      {/* Card 3: Added */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs flex items-center gap-3">
        <div className="p-2.5 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
          <PlusCircle className="w-5 h-5" />
        </div>
        <div>
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
            Ditambahkan (+)
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-extrabold text-emerald-700">
              +{summary.addedWords}
            </span>
            <span className="text-xs text-slate-500">
              kata ({summary.addedChars} huruf)
            </span>
          </div>
        </div>
      </div>

      {/* Card 4: Removed */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs flex items-center gap-3">
        <div className="p-2.5 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
          <MinusCircle className="w-5 h-5" />
        </div>
        <div>
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
            Dihapus (-)
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-extrabold text-rose-700">
              -{summary.removedWords}
            </span>
            <span className="text-xs text-slate-500">
              kata ({summary.removedChars} huruf)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// SRT SHARED TYPES & NORMALIZATION
// ============================================================
// Single source of truth untuk SRTSegment.
// Tidak ada duplikasi definisi di types.ts.
// ============================================================

export interface SRTSegment {
  index: number;
  start: string;
  end: string;
  text: string;
}

export function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[“”"'`]/g, '')
    .replace(/[.,!?;:()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
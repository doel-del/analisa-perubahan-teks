// ============================================================
// EVIDENCE SEARCH HELPER
// ============================================================
// Digunakan oleh GroundingValidator dan ProvenanceValidator.
// Mencari source_excerpt dalam originating chunk.
// ============================================================

import type { EvidenceContext, SegmentMatch } from './types';
import { normalizeForSearch } from './srt';

export function findSourceMatches(
  sourceExcerpt: string | null | undefined,
  context: EvidenceContext
): SegmentMatch[] {
  const excerpt = normalizeForSearch(sourceExcerpt || '');

  if (!excerpt) {
    return [];
  }

  const matches: SegmentMatch[] = [];

  // 1. Exact normalized: single segment
  for (const segment of context.chunkSegments) {
    const segText = normalizeForSearch(segment.text);
    if (segText.includes(excerpt)) {
      matches.push({
        segmentStartIndex: segment.index,
        segmentEndIndex: segment.index
      });
    }
  }

  // 2. Exact normalized: 2 contiguous segments
  for (let i = 0; i < context.chunkSegments.length - 1; i++) {
    const combined = normalizeForSearch(
      context.chunkSegments[i].text + ' ' +
      context.chunkSegments[i + 1].text
    );

    if (combined.includes(excerpt)) {
      const seg1 = normalizeForSearch(context.chunkSegments[i].text);
      const seg2 = normalizeForSearch(context.chunkSegments[i + 1].text);

      const isEntirelyInSeg1 = seg1.includes(excerpt);
      const isEntirelyInSeg2 = seg2.includes(excerpt);

      if (!isEntirelyInSeg1 && !isEntirelyInSeg2) {
        matches.push({
          segmentStartIndex: context.chunkSegments[i].index,
          segmentEndIndex: context.chunkSegments[i + 1].index
        });
      }
    }
  }

  // 3. Exact normalized: 3 contiguous segments
  for (let i = 0; i < context.chunkSegments.length - 2; i++) {
    const combined = normalizeForSearch(
      context.chunkSegments[i].text + ' ' +
      context.chunkSegments[i + 1].text + ' ' +
      context.chunkSegments[i + 2].text
    );

    if (combined.includes(excerpt)) {
      const seg1 = normalizeForSearch(context.chunkSegments[i].text);
      const seg2 = normalizeForSearch(context.chunkSegments[i + 1].text);
      const seg3 = normalizeForSearch(context.chunkSegments[i + 2].text);

      const isEntirelyInSeg1 = seg1.includes(excerpt);
      const isEntirelyInSeg2 = seg2.includes(excerpt);
      const isEntirelyInSeg3 = seg3.includes(excerpt);
      const isEntirelyInCombined2 =
        normalizeForSearch(
          context.chunkSegments[i].text + ' ' +
          context.chunkSegments[i + 1].text
        ).includes(excerpt) ||
        normalizeForSearch(
          context.chunkSegments[i + 1].text + ' ' +
          context.chunkSegments[i + 2].text
        ).includes(excerpt);

      if (
        !isEntirelyInSeg1 &&
        !isEntirelyInSeg2 &&
        !isEntirelyInSeg3 &&
        !isEntirelyInCombined2
      ) {
        matches.push({
          segmentStartIndex: context.chunkSegments[i].index,
          segmentEndIndex: context.chunkSegments[i + 2].index
        });
      }
    }
  }

  // Dedup final berdasarkan span unik
  const unique = new Map<string, SegmentMatch>();

  for (const match of matches) {
    const key = `${match.segmentStartIndex}:${match.segmentEndIndex}`;
    unique.set(key, match);
  }

  return [...unique.values()];
}
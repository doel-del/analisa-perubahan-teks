// ============================================================
// ANCHOR-BASED PROVENANCE RESOLVER — INTERNAL
// ============================================================
// BUKAN validator keempat. Dipanggil DARI DALAM
// ProvenanceValidator.resolve(). Tidak diekspor ke
// evidence-validator.ts, tidak didaftarkan di validators/index.ts
// sebagai peer Grounding/Provenance.
//
// INVARIANT ARSITEKTUR (dikunci audit ronde 3):
//
//   1. Candidate set WAJIB berasal dari findSourceMatches().
//      DILARANG membuat matcher/window baru.
//
//   2. Anchor comparison memakai normalizer yang sama dengan
//      search.ts (normalizeForSearch). DILARANG membuat normalizer
//      lokal atau alias semantic.
//
//   3. Anchor dicek terhadap TEKS CANDIDATE SPAN ITU SENDIRI
//      (segmentStartIndex..segmentEndIndex). DILARANG memperluas
//      window ke segmen tetangga (backward/forward, radius apapun).
//      Cross-segment coreference bukan tanggung jawab resolver ini.
//      Test #4/#5/#6 di anchor-resolver.contract.test.ts adalah
//      tripwire aktif terhadap regresi tersebut.
//
//   4. RESOLVED hanya jika cardinality(candidateSupport) === 1.
//      Tidak ada fallback "ambil yang pertama/terdekat".
// ============================================================

import type {
  EvidenceContext,
  SourceCoordinates,
  SegmentMatch
} from '../types';
import { findSourceMatches } from '../search';
import { normalizeForSearch } from '../srt';

export type ProvenanceResolutionStatus = 'RESOLVED' | 'AMBIGUOUS';

export interface ProvenanceResolution {
  status: ProvenanceResolutionStatus;
  coordinates: SourceCoordinates | null;
}

// ------------------------------------------------------------
// HELPER — teks candidate span. Unit evaluasi SAMA dengan yang
// menghasilkan span tersebut di findSourceMatches(). TIDAK
// diperluas ke segmen di luar segmentStartIndex..segmentEndIndex.
// ------------------------------------------------------------

function getCandidateSpanText(
  candidate: SegmentMatch,
  context: EvidenceContext
): string {
  return context.chunkSegments
    .filter(
      seg =>
        seg.index >= candidate.segmentStartIndex &&
        seg.index <= candidate.segmentEndIndex
    )
    .map(seg => seg.text)
    .join(' ');
}

function candidateToCoordinates(
  candidate: SegmentMatch,
  context: EvidenceContext
): SourceCoordinates {
  return {
    chunk_index: context.chunkIndex,
    segment_start_index: candidate.segmentStartIndex,
    segment_end_index: candidate.segmentEndIndex,
    char_start: null,
    char_end: null
  };
}

// ------------------------------------------------------------
// resolveProvenanceAnchor()
// ------------------------------------------------------------

export function resolveProvenanceAnchor(
  sourceExcerpt: string | null | undefined,
  anchor: string | null | undefined,
  context: EvidenceContext
): ProvenanceResolution {
  const candidates = findSourceMatches(sourceExcerpt, context);

  // 0 match: bukan tanggung jawab resolver ini (Grounding sudah
  // FAIL sebelum resolver dipanggil). Defensif: AMBIGUOUS+null.
  if (candidates.length === 0) {
    return { status: 'AMBIGUOUS', coordinates: null };
  }

  // 1 match → RESOLVED (anchor tidak diperlukan).
  if (candidates.length === 1) {
    return {
      status: 'RESOLVED',
      coordinates: candidateToCoordinates(candidates[0], context)
    };
  }

  // >1 match: anchor wajib ada dan diskriminatif.
  const normalizedAnchor = normalizeForSearch(anchor || '');

  if (!normalizedAnchor) {
    return { status: 'AMBIGUOUS', coordinates: null };
  }

  const supported = candidates.filter(candidate => {
    const spanText = normalizeForSearch(
      getCandidateSpanText(candidate, context)
    );
    return spanText.includes(normalizedAnchor);
  });

  // RESOLVED hanya jika cardinality(candidateSupport) === 1.
  if (supported.length !== 1) {
    return { status: 'AMBIGUOUS', coordinates: null };
  }

  return {
    status: 'RESOLVED',
    coordinates: candidateToCoordinates(supported[0], context)
  };
}
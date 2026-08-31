// ============================================================
// PROVENANCE VALIDATOR
// ============================================================

import type {
  EvidenceContext,
  SourceCoordinates,
  ValidationResult
} from '../types';
import { findSourceMatches } from '../search';

export const ProvenanceValidator = {
  resolve(
    sourceExcerpt: string | null | undefined,
    context: EvidenceContext
  ): {
    coordinates: SourceCoordinates | null;
    result: ValidationResult;
  } {
    const matches = findSourceMatches(sourceExcerpt, context);

    if (matches.length === 0) {
      return {
        coordinates: null,
        result: {
          pass: false,
          status: 'FAIL',
          rule: 'PROVENANCE',
          reason: 'source_excerpt tidak ditemukan di originating chunk',
          severity: 'CRITICAL'
        }
      };
    }

    if (matches.length === 1) {
      const match = matches[0];
      return {
        coordinates: {
          chunk_index: context.chunkIndex,
          segment_start_index: match.segmentStartIndex,
          segment_end_index: match.segmentEndIndex,
          char_start: null,
          char_end: null
        },
        result: {
          pass: true,
          status: 'PASS',
          rule: 'PROVENANCE',
          severity: 'LOW'
        }
      };
    }

    // Ambiguous: lebih dari satu occurrence
    return {
      coordinates: null,
      result: {
        pass: true,
        status: 'SUSPECT',
        rule: 'PROVENANCE',
        reason: 'source_excerpt ambiguous, lebih dari satu kemungkinan occurrence',
        severity: 'MEDIUM'
      }
    };
  }
};
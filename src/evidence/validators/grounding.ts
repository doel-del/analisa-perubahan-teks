// ============================================================
// GROUNDING VALIDATOR — existence only (pasca-redesign)
// ============================================================
// Keberadaan >1 match BUKAN urusan Grounding. Ambiguitas adalah
// domain Provenance. Grounding tidak lagi pernah mengembalikan
// SUSPECT.
// ============================================================

import type {
  EvidenceContext,
  ValidationResult
} from '../types';
import { findSourceMatches } from '../search';

export const GroundingValidator = {
  validate(
    sourceExcerpt: string | null | undefined,
    context: EvidenceContext
  ): ValidationResult {
    const matches = findSourceMatches(sourceExcerpt, context);

    if (matches.length === 0) {
      return {
        pass: false,
        status: 'FAIL',
        rule: 'GROUNDING',
        reason: 'source_excerpt tidak ditemukan di originating chunk',
        severity: 'CRITICAL'
      };
    }

    return {
      pass: true,
      status: 'PASS',
      rule: 'GROUNDING',
      severity: 'LOW'
    };
  }
};

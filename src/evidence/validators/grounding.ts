// ============================================================
// GROUNDING VALIDATOR
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

    if (matches.length === 1) {
      return {
        pass: true,
        status: 'PASS',
        rule: 'GROUNDING',
        severity: 'LOW'
      };
    }

    return {
      pass: true,
      status: 'SUSPECT',
      rule: 'GROUNDING',
      reason: 'source_excerpt muncul lebih dari satu kali di chunk',
      severity: 'MEDIUM'
    };
  }
};
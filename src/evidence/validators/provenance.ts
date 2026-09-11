// ============================================================
// PROVENANCE VALIDATOR
// ============================================================
// Tanggung jawab:
//   1. Menentukan existence (via findSourceMatches) → FAIL jika 0.
//   2. Mendelegasikan occurrence disambiguation ke
//      resolveProvenanceAnchor() → RESOLVED / AMBIGUOUS.
//
// Resolver internal sengaja TIDAK menangani FAIL — status-nya
// hanya RESOLVED | AMBIGUOUS (dikunci audit Ronde 3). FAIL
// dibangun di sini dari sinyal existence, karena "existence" adalah
// domain findSourceMatches / Grounding, bukan domain resolver.
// ============================================================

import type {
  EvidenceContext,
  SourceCoordinates,
  ValidationResult
} from '../types';
import { findSourceMatches } from '../search';
import { resolveProvenanceAnchor } from './anchor-resolver';

export const ProvenanceValidator = {
  resolve(
    sourceExcerpt: string | null | undefined,
    anchor: string | null | undefined,
    context: EvidenceContext
  ): {
    coordinates: SourceCoordinates | null;
    result: ValidationResult;
  } {
    // Existence gate. Bukan tanggung jawab resolver — resolver
    // berasumsi candidate set sudah non-empty ketika dipanggil.
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

    // Occurrence disambiguation. ≥1 match di sini.
    const resolution = resolveProvenanceAnchor(
      sourceExcerpt,
      anchor,
      context
    );

    if (resolution.status === 'AMBIGUOUS') {
      return {
        coordinates: null,
        result: {
          pass: true,
          status: 'SUSPECT',
          rule: 'PROVENANCE',
          reason: 'source_excerpt ambiguous, lebih dari satu kemungkinan occurrence',
          severity: 'HIGH'
        }
      };
    }

    // resolution.status === 'RESOLVED'
    return {
      coordinates: resolution.coordinates,
      result: {
        pass: true,
        status: 'PASS',
        rule: 'PROVENANCE',
        severity: 'LOW'
      }
    };
  }
};

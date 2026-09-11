// ============================================================
// EVIDENCE VALIDATOR — Orchestrator dengan Acceptance Policy
// ============================================================

import type {
  EvidenceContext,
  EvidenceItem,
  EvidenceValidationReport,
  ValidationResult,
  FinalStatus
} from '../types';
import { GroundingValidator } from './grounding';
import { ProvenanceValidator } from './provenance';
import { AssessmentValidator } from './assessment';
import { ValueValidator } from './value';
import { AtomicityValidator } from './atomicity';

export const EvidenceValidator = {
  validate(
    evidence: EvidenceItem,
    context: EvidenceContext
  ): EvidenceValidationReport {
    const results: ValidationResult[] = [];

    // 1. Grounding — existence only
    const groundingResult = GroundingValidator.validate(
      evidence.source_excerpt,
      context
    );
    results.push(groundingResult);

    // 2. Provenance — resolve menggunakan evidence.subtopic sebagai anchor
    const provenanceResult = ProvenanceValidator.resolve(
      evidence.source_excerpt,
      evidence.subtopic,
      context
    );
    results.push(provenanceResult.result);

    // Set source_coordinates ONLY jika resolved secara unik
    if (provenanceResult.coordinates) {
      evidence.source_coordinates = provenanceResult.coordinates;
    } else {
      evidence.source_coordinates = null;
    }

    // 3. Assessment
    results.push(
      AssessmentValidator.validate(
        evidence.type,
        evidence.reviewer_assessment
      )
    );

    // 4. Value
    results.push(
      ValueValidator.validate(evidence.value, evidence.unit)
    );

    // 5. Atomicity
    results.push(
      AtomicityValidator.validate(evidence.claim)
    );

    // ============================================================
    // ACCEPTANCE POLICY — Epistemic Gatekeeper
    // ============================================================

    // 1. FAIL → selalu quarantine
    const hasFail = results.some(r => r.status === 'FAIL');
    if (hasFail) {
      const failedReasons = results
        .filter(r => r.status === 'FAIL')
        .map(r => `${r.rule}: ${r.reason || r.rule}`)
        .join('; ');
      return quarantine(evidence, results, `FAIL: ${failedReasons}`);
    }

    // 2. SUSPECT severity HIGH → quarantine
    const hasSuspectHigh = results.some(
      r => r.status === 'SUSPECT' && r.severity === 'HIGH'
    );
    if (hasSuspectHigh) {
      const highReasons = results
        .filter(r => r.status === 'SUSPECT' && r.severity === 'HIGH')
        .map(r => `${r.rule}: ${r.reason || r.rule}`)
        .join('; ');
      return quarantine(evidence, results, `SUSPECT HIGH: ${highReasons}`);
    }

    // 3. PROVENANCE SUSPECT → quarantine (P0 invariant)
    //    GROUNDING pasca-redesign existence-only, tidak pernah SUSPECT.
    const hasProvenanceSuspect = results.some(
      r => r.rule === 'PROVENANCE' && r.status === 'SUSPECT'
    );
    if (hasProvenanceSuspect) {
      return quarantine(
        evidence,
        results,
        'SUSPECT PROVENANCE: source_excerpt ambiguous (residual, tidak ter-resolve anchor)'
      );
    }

    // 4. ATOMICITY SUSPECT → accepted=true, ditandai untuk atomicization
    const hasAtomicitySuspect = results.some(
      r => r.rule === 'ATOMICITY' && r.status === 'SUSPECT'
    );

    // 5. VALUE SUSPECT → accepted=true, perlu review (P1)
    const hasValueSuspect = results.some(
      r => r.rule === 'VALUE' && r.status === 'SUSPECT'
    );

    // 6. Semua PASS → accepted=true
    const accepted = true;
    const quarantineReason = undefined;

    const finalStatus: FinalStatus = hasAtomicitySuspect || hasValueSuspect
      ? 'VALID_WITH_NORMALIZATION'
      : 'VALID';

    evidence.validation = {
      accepted,
      results,
      quarantineReason,
      finalStatus
    };

    return {
      accepted,
      results,
      quarantineReason,
      finalStatus
    };
  }
};

function quarantine(
  evidence: EvidenceItem,
  results: ValidationResult[],
  reason: string
): EvidenceValidationReport {
  const finalStatus: FinalStatus = 'QUARANTINE';
  evidence.validation = {
    accepted: false,
    results,
    quarantineReason: reason,
    finalStatus
  };
  return {
    accepted: false,
    results,
    quarantineReason: reason,
    finalStatus
  };
}

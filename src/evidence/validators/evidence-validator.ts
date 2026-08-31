// ============================================================
// EVIDENCE VALIDATOR — Orchestrator
// ============================================================

import type {
  EvidenceContext,
  EvidenceItem,
  EvidenceValidationReport,
  ValidationResult
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

    // 1. Grounding
    const groundingResult = GroundingValidator.validate(
      evidence.source_excerpt,
      context
    );
    results.push(groundingResult);

    // 2. Provenance
    const provenanceResult = ProvenanceValidator.resolve(
      evidence.source_excerpt,
      context
    );
    results.push(provenanceResult.result);

    // Set source_coordinates jika resolved
    if (provenanceResult.coordinates) {
      evidence.source_coordinates = provenanceResult.coordinates;
    } else {
      evidence.source_coordinates = null;
    }

    // 3. Assessment
    const assessmentResult = AssessmentValidator.validate(
      evidence.type,
      evidence.reviewer_assessment
    );
    results.push(assessmentResult);

    // 4. Value
    const valueResult = ValueValidator.validate(
      evidence.value,
      evidence.unit
    );
    results.push(valueResult);

    // 5. Atomicity
    const atomicityResult = AtomicityValidator.validate(
      evidence.claim
    );
    results.push(atomicityResult);

    // Acceptance: setiap FAIL → quarantine
    const failedResults = results.filter(
      result => result.status === 'FAIL'
    );

    const accepted = failedResults.length === 0;

    const quarantineReason = !accepted
      ? failedResults
          .map(r => r.reason || r.rule)
          .join('; ')
      : undefined;

    evidence.validation = {
      accepted,
      results,
      quarantineReason
    };

    return {
      accepted,
      results,
      quarantineReason
    };
  }
};
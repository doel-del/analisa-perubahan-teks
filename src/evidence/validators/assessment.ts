// ============================================================
// ASSESSMENT VALIDATOR
// ============================================================
// Invariant deterministik:
//   FACT → reviewer_assessment = null
//   RECOMMENDATION → reviewer_assessment = null
// ============================================================

import type { ValidationResult } from '../types';

export const AssessmentValidator = {
  validate(
    type: string | undefined,
    reviewerAssessment: string | null | undefined
  ): ValidationResult {
    if (
      (type === 'FACT' || type === 'RECOMMENDATION') &&
      reviewerAssessment !== null &&
      reviewerAssessment !== undefined
    ) {
      return {
        pass: false,
        status: 'FAIL',
        rule: 'ASSESSMENT',
        reason: `${type} tidak boleh memiliki reviewer_assessment`,
        severity: 'HIGH'
      };
    }

    return {
      pass: true,
      status: 'PASS',
      rule: 'ASSESSMENT',
      severity: 'LOW'
    };
  }
};
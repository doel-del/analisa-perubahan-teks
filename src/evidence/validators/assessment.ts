// ============================================================
// ASSESSMENT VALIDATOR
// ============================================================
// Hanya OPINION yang boleh memiliki reviewer_assessment.
// Semua type lain WAJIB null.
// ============================================================

import type { ValidationResult } from '../types';

const ALLOWED_TYPES_FOR_ASSESSMENT = ['OPINION'];

export const AssessmentValidator = {
  validate(
    type: string | undefined,
    reviewerAssessment: string | null | undefined
  ): ValidationResult {
    const normalizedType = (type || 'OPINION').toUpperCase();

    const hasAssessment =
      reviewerAssessment !== null &&
      reviewerAssessment !== undefined &&
      String(reviewerAssessment).trim() !== '';

    if (hasAssessment && !ALLOWED_TYPES_FOR_ASSESSMENT.includes(normalizedType)) {
      return {
        pass: false,
        status: 'FAIL',
        rule: 'ASSESSMENT',
        reason: `${normalizedType} tidak boleh memiliki reviewer_assessment (hanya OPINION yang boleh)`,
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

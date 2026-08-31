// ============================================================
// ATOMICITY VALIDATOR
// ============================================================

import type { ValidationResult } from '../types';

export const AtomicityValidator = {
  validate(claim: string | undefined): ValidationResult {
    const normalizedClaim = (claim || '').toLowerCase();

    const strongIndicators = [
      ' dan ',
      ' serta ',
      ' plus ',
      ' dengan dukungan '
    ];

    const hasStrongIndicator = strongIndicators.some(indicator =>
      normalizedClaim.includes(indicator)
    );

    const configurativePatterns = [
      /lengkap dengan/,
      /dilengkapi dengan/,
      /menyatu dengan/,
      /ditemani oleh/,
      /terdiri dari/
    ];

    const isConfigurative = configurativePatterns.some(pattern =>
      pattern.test(normalizedClaim)
    );

    if (hasStrongIndicator && !isConfigurative) {
      return {
        pass: true,
        status: 'SUSPECT',
        rule: 'ATOMICITY',
        reason: 'Indikasi compound claim, perlu review manual',
        severity: 'MEDIUM'
      };
    }

    return {
      pass: true,
      status: 'PASS',
      rule: 'ATOMICITY',
      severity: 'LOW'
    };
  }
};
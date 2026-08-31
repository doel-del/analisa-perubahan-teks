// ============================================================
// VALUE VALIDATOR
// ============================================================

import type { ValidationResult } from '../types';

export const ValueValidator = {
  validate(
    value: string | number | null | undefined,
    unit: string | null | undefined
  ): ValidationResult {
    const valueStr = String(value ?? '').trim();

    if (!valueStr) {
      return {
        pass: true,
        status: 'PASS',
        rule: 'VALUE',
        severity: 'LOW'
      };
    }

    // Compound value: "8/256"
    if (valueStr.includes('/')) {
      const parts = valueStr.split('/');
      if (parts.length === 2) {
        const isNumericCompound =
          isNumeric(parts[0].trim()) &&
          isNumeric(parts[1].trim());

        if (isNumericCompound) {
          // Known-valid fractions
          const knownValidFractions = [
            { value: '1/30', units: ['detik', 's', 'second'] },
            { value: '1/60', units: ['detik', 's', 'second'] }
          ];

          const isKnownValid = knownValidFractions.some(f =>
            f.value === valueStr &&
            f.units.some(u => (unit || '').toLowerCase() === u)
          );

          if (isKnownValid) {
            return {
              pass: true,
              status: 'PASS',
              rule: 'VALUE',
              severity: 'LOW'
            };
          }

          // Known compound: "8/256" with unit "GB"
          if (unit && unit.toLowerCase() === 'gb') {
            return {
              pass: false,
              status: 'FAIL',
              rule: 'VALUE',
              reason: `Compound value terdeteksi: ${valueStr} ${unit}`,
              severity: 'HIGH'
            };
          }

          // Unknown numeric ratio → SUSPECT
          return {
            pass: true,
            status: 'SUSPECT',
            rule: 'VALUE',
            reason: `Numeric ratio yang belum dikenal: ${valueStr}`,
            severity: 'MEDIUM'
          };
        }
      }
    }

    return {
      pass: true,
      status: 'PASS',
      rule: 'VALUE',
      severity: 'LOW'
    };
  }
};

function isNumeric(str: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(str);
}
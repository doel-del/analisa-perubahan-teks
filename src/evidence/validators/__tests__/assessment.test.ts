import { describe, test, expect } from 'vitest';
import { AssessmentValidator } from '../assessment';

describe('ASSESSMENT VALIDATOR', () => {
  test('PASS: FACT + null', () => {
    const result = AssessmentValidator.validate('FACT', null);
    expect(result.status).toBe('PASS');
  });

  test('PASS: OPINION + positive', () => {
    const result = AssessmentValidator.validate('OPINION', 'positive');
    expect(result.status).toBe('PASS');
  });

  test('PASS: OBSERVATION + null', () => {
    const result = AssessmentValidator.validate('OBSERVATION', null);
    expect(result.status).toBe('PASS');
  });

  test('FAIL: FACT + positive', () => {
    const result = AssessmentValidator.validate('FACT', 'positive');
    expect(result.status).toBe('FAIL');
  });

  test('FAIL: RECOMMENDATION + positive', () => {
    const result = AssessmentValidator.validate('RECOMMENDATION', 'positive');
    expect(result.status).toBe('FAIL');
  });

  test('FAIL: FACT + negative', () => {
    const result = AssessmentValidator.validate('FACT', 'negative');
    expect(result.status).toBe('FAIL');
  });
});
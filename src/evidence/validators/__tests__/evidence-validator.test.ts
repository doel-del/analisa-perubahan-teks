import { describe, test, expect } from 'vitest';
import { EvidenceValidator } from '../evidence-validator';
import type { EvidenceContext, EvidenceItem } from '../../types';

const context: EvidenceContext = {
  chunkIndex: 0,
  chunkText: 'Segment 1: Refresh rate 120Hz',
  chunkSegments: [
    { index: 1, start: '00:00:01,000', end: '00:00:02,000', text: 'Refresh rate 120Hz' }
  ]
};

describe('EVIDENCE VALIDATOR', () => {
  test('PASS: valid evidence', () => {
    const evidence: EvidenceItem = {
      type: 'FACT',
      claim: 'Refresh rate 120Hz',
      source_excerpt: 'Refresh rate 120Hz',
      reviewer_assessment: null
    };
    const report = EvidenceValidator.validate(evidence, context);
    expect(report.accepted).toBe(true);
    expect(evidence.source_coordinates).not.toBeNull();
  });

  test('FAIL: ungrounded evidence', () => {
    const evidence: EvidenceItem = {
      type: 'FACT',
      claim: 'Baterai 5000 mAh',
      source_excerpt: 'tidak ada di chunk',
      reviewer_assessment: null
    };
    const report = EvidenceValidator.validate(evidence, context);
    expect(report.accepted).toBe(false);
    expect(evidence.source_coordinates).toBeNull();
  });

  test('FAIL: assessment violation', () => {
    const evidence: EvidenceItem = {
      type: 'FACT',
      claim: 'Refresh rate 120Hz',
      source_excerpt: 'Refresh rate 120Hz',
      reviewer_assessment: 'positive'
    };
    const report = EvidenceValidator.validate(evidence, context);
    expect(report.accepted).toBe(false);
  });

  test('SUSPECT: ambiguous grounding', () => {
    const ambiguousContext: EvidenceContext = {
      chunkIndex: 0,
      chunkText: '6 generasi Android\n6 generasi Android',
      chunkSegments: [
        { index: 1, start: '00:00:01,000', end: '00:00:02,000', text: '6 generasi Android' },
        { index: 2, start: '00:00:02,000', end: '00:00:03,000', text: '6 generasi Android' }
      ]
    };
    const evidence: EvidenceItem = {
      type: 'FACT',
      claim: '6 generasi Android',
      source_excerpt: '6 generasi Android',
      reviewer_assessment: null
    };
    const report = EvidenceValidator.validate(evidence, ambiguousContext);
    expect(report.accepted).toBe(true);
    expect(evidence.source_coordinates).toBeNull();
  });
});
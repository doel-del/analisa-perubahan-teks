// ============================================================
// REGRESSION TEST — PARALLEL_DEVICE_SPEC_AMBIGUITY
// ============================================================
// Tujuan: mengunci bahwa gap GROUNDING/PROVENANCE yang ditemukan dari
// log production (Test Gemini temperature 0.0, Chunk #2, kategori
// kuarantine "Ambiguous") SUDAH DIPERBAIKI lewat redesign:
//
//   - GroundingValidator menjadi existence-only (Stage 5)
//   - ProvenanceValidator menerima anchor (evidence.subtopic) dan
//     mendelegasikan occurrence disambiguation ke anchor resolver
//     (Stage 4)
//   - EvidenceValidator meneruskan evidence.subtopic sebagai anchor
//     (Stage 6)
//
// Sebelum redesign, excerpt template pendek ("bukaan f/2.2",
// "fixed focus", "up to 1080p 30 fps") yang muncul PERSIS 2x di chunk
// (sekali per device paralel selfie vs ultrawide) otomatis dianggap
// ambigu → false quarantine.
//
// Setelah redesign, anchor (subtopic) memilih candidate span yang
// tepat → provenance RESOLVED → evidence diterima.
//
// STATUS TEST INI: POSITIVE REGRESSION ASSERTION.
// Test-test di Bagian A dan D meng-assert perilaku BENAR pasca-fix.
// Bagian B tetap meng-assert jalur fail-safe (multiple occurrence +
// tidak ada anchor → tetap AMBIGUOUS, tidak boleh menebak).
// Bagian C adalah kontrol negatif untuk excerpt yang memang spesifik.
//
// FIXTURE: segmen 95-103 disalin verbatim dari
// "INPUT External/transcript.srt" (Samsung Galaxy A26 5G review).
// chunkIndex/timestamps dipertahankan sesuai SRT asli.
//
// Tidak mengubah production code.
// Tidak mengubah prompt.
// ============================================================

import { describe, test, expect } from 'vitest';
import { GroundingValidator } from '../grounding';
import { ProvenanceValidator } from '../provenance';
import { EvidenceValidator } from '../evidence-validator';
import type { EvidenceContext, EvidenceItem, EvidenceValidationReport } from '../../types';

// ------------------------------------------------------------
// FIXTURE — segmen 95-103, verbatim dari transcript.srt asli
// ------------------------------------------------------------

const context: EvidenceContext = {
  chunkIndex: 1,
  chunkSegments: [
    { index: 95, start: '00:05:09,129', end: '00:05:15,569', text: 'Lalu untuk di bezel atas layar ini, terdapat earpiece yang ditemani oleh kamera selfie dengan model waterdrop.' },
    { index: 96, start: '00:05:15,569', end: '00:05:20,569', text: 'Ini adalah kamera selfie 13 MP, bukaan f/2.2, fixed focus.' },
    { index: 97, start: '00:05:20,569', end: '00:05:24,129', text: 'Perekaman videonya up to 1080p 30 fps.' },
    { index: 98, start: '00:05:24,129', end: '00:05:27,610', text: 'Beralih ke sisi belakang, ini adalah 50 MP Main Camera.' },
    { index: 99, start: '00:05:27,610', end: '00:05:29,529', text: 'Bukaannya f/1.8, auto focus.' },
    { index: 100, start: '00:05:29,529', end: '00:05:35,089', text: 'Perekaman video bisa sampai 4K 30 fps dan ada pilihan juga untuk 1080p 60 fps.' },
    { index: 101, start: '00:05:35,089', end: '00:05:40,050', text: 'Kemudian untuk kamera berikutnya ada kamera ultrawide 8 MP, bukaan f/2.2.' },
    { index: 102, start: '00:05:40,050', end: '00:05:44,370', text: 'Ini fixed focus juga ya, perekaman videonya up to 1080p 30 fps.' },
    { index: 103, start: '00:05:44,370', end: '00:05:48,550', text: 'Kemudian ada kamera 2 MP macro camera dan ada LED flash.' }
  ],
  chunkText: [
    'Lalu untuk di bezel atas layar ini, terdapat earpiece yang ditemani oleh kamera selfie dengan model waterdrop.',
    'Ini adalah kamera selfie 13 MP, bukaan f/2.2, fixed focus.',
    'Perekaman videonya up to 1080p 30 fps.',
    'Beralih ke sisi belakang, ini adalah 50 MP Main Camera.',
    'Bukaannya f/1.8, auto focus.',
    'Perekaman video bisa sampai 4K 30 fps dan ada pilihan juga untuk 1080p 60 fps.',
    'Kemudian untuk kamera berikutnya ada kamera ultrawide 8 MP, bukaan f/2.2.',
    'Ini fixed focus juga ya, perekaman videonya up to 1080p 30 fps.',
    'Kemudian ada kamera 2 MP macro camera dan ada LED flash.'
  ].join(' ')
};

describe('PARALLEL_DEVICE_SPEC_AMBIGUITY — fix terverifikasi', () => {

  // ============================================================
  // BAGIAN A — GroundingValidator existence-only
  // ============================================================
  // Sebelum redesign: excerpt template pendek yang muncul >1x
  // ditandai SUSPECT/HIGH oleh Grounding → memicu false quarantine.
  //
  // Setelah redesign: Grounding hanya cek existence. Keberadaan >1
  // match bukan urusan Grounding — itu domain Provenance.
  // ============================================================
  describe('A. GroundingValidator existence-only: multiple match = PASS', () => {

    test('"bukaan f/2.2" muncul di segmen 96 (selfie) DAN 101 (ultrawide) → PASS', () => {
      const result = GroundingValidator.validate('bukaan f/2.2', context);
      expect(result.status).toBe('PASS');
      expect(result.severity).toBe('LOW');
    });

    test('"fixed focus" muncul di segmen 96 (selfie) DAN 102 (ultrawide) → PASS', () => {
      const result = GroundingValidator.validate('fixed focus', context);
      expect(result.status).toBe('PASS');
      expect(result.severity).toBe('LOW');
    });

    test('"up to 1080p 30 fps" muncul di segmen 97 (selfie) DAN 102 (ultrawide) → PASS', () => {
      const result = GroundingValidator.validate('up to 1080p 30 fps', context);
      expect(result.status).toBe('PASS');
      expect(result.severity).toBe('LOW');
    });
  });

  // ============================================================
  // BAGIAN B — ProvenanceValidator fail-safe saat anchor tidak tersedia
  // ============================================================
  // Regression guard untuk jalur: multiple occurrence + anchor null
  // (tidak tersedia) → WAJIB tetap AMBIGUOUS → wrapper SUSPECT.
  // Resolver tidak boleh menebak occurrence manapun secara arbitrer.
  //
  // Anchor sengaja null di sini (bukan 'selfie'/'ultrawide') supaya
  // coverage berbeda dari contract test #1–#3 dan Bagian D, yang
  // menguji jalur anchor-tersedia.
  // ============================================================
  describe('B. ProvenanceValidator fail-safe: multiple occurrence tanpa anchor → SUSPECT', () => {

    test('"bukaan f/2.2" tanpa anchor → coordinates null, status SUSPECT', () => {
      const result = ProvenanceValidator.resolve('bukaan f/2.2', null, context);
      expect(result.coordinates).toBeNull();
      expect(result.result.status).toBe('SUSPECT');
    });

    test('"fixed focus" tanpa anchor → coordinates null, status SUSPECT', () => {
      const result = ProvenanceValidator.resolve('fixed focus', null, context);
      expect(result.coordinates).toBeNull();
      expect(result.result.status).toBe('SUSPECT');
    });
  });

  // ============================================================
  // BAGIAN C — KONTROL: excerpt unik tetap PASS
  // ============================================================
  // Membuktikan bahwa existence-only tidak berarti "semua dianggap
  // valid tanpa peduli kondisi". Excerpt yang memang hanya punya 1
  // occurrence tetap PASS.
  // ============================================================
  describe('C. Kontrol — excerpt yang cukup spesifik tetap PASS', () => {

    test('KONTROL: "kamera selfie 13 MP" unik (hanya di segmen 96) → PASS', () => {
      const result = GroundingValidator.validate('kamera selfie 13 MP', context);
      expect(result.status).toBe('PASS');
    });

    test('KONTROL: "kamera ultrawide 8 MP" unik (hanya di segmen 101) → PASS', () => {
      const result = GroundingValidator.validate('kamera ultrawide 8 MP', context);
      expect(result.status).toBe('PASS');
    });

    test('KONTROL: "Bukaannya f/1.8" unik (kamera utama, segmen 99) → PASS', () => {
      const result = GroundingValidator.validate('Bukaannya f/1.8', context);
      expect(result.status).toBe('PASS');
    });
  });

  // ============================================================
  // BAGIAN D — END-TO-END: bukti fix menghilangkan false quarantine
  // ============================================================
  // Mereplikasi persis pola production: dua evidence ATOMIK dan BENAR
  // (satu tentang selfie, satu tentang ultrawide), masing-masing pakai
  // source_excerpt pendek yang templatenya sama.
  //
  // Sebelum redesign: keduanya false-quarantine karena Grounding SUSPECT.
  // Setelah redesign:
  //   - Grounding existence-only → PASS
  //   - Provenance menerima subtopic sebagai anchor → memilih
  //     candidate span yang tepat → RESOLVED → PASS
  //   - EvidenceValidator → accepted, VALID
  // ============================================================
  describe('D. Fix end-to-end: dua evidence sah diterima, bukan lagi false-quarantine', () => {

    const selfieEvidence: EvidenceItem = {
      topic: 'camera',
      subtopic: 'selfie',
      type: 'FACT',
      claim: 'Kamera selfie memiliki bukaan f/2.2.',
      source_excerpt: 'bukaan f/2.2',
      reviewer_assessment: null
    };

    const ultrawideEvidence: EvidenceItem = {
      topic: 'camera',
      subtopic: 'ultrawide',
      type: 'FACT',
      claim: 'Kamera ultrawide memiliki bukaan f/2.2.',
      source_excerpt: 'bukaan f/2.2',
      reviewer_assessment: null
    };

    test('evidence selfie (bukaan f/2.2) DITERIMA karena anchor memilih candidate span yang tepat', () => {
      const report: EvidenceValidationReport = EvidenceValidator.validate(selfieEvidence, context);
      expect(report.accepted).toBe(true);
      expect(report.quarantineReason).toBeUndefined();
      expect(report.finalStatus).toBe('VALID');

      // Penguatan (dari Senior 1): buktikan PROVENANCE memang PASS,
      // bukan hanya "evidence kebetulan lolos".
      const provenance = report.results.find(r => r.rule === 'PROVENANCE');
      expect(provenance?.status).toBe('PASS');

      // Bukti lebih spesifik: coordinates terisi (resolver berhasil).
      expect(selfieEvidence.source_coordinates?.segment_start_index).toBe(96);
    });

    test('evidence ultrawide (bukaan f/2.2) JUGA DITERIMA dan ter-resolve ke segmen 101 yang berbeda dari selfie', () => {
      const report: EvidenceValidationReport = EvidenceValidator.validate(ultrawideEvidence, context);
      expect(report.accepted).toBe(true);
      expect(report.quarantineReason).toBeUndefined();
      expect(report.finalStatus).toBe('VALID');

      const provenance = report.results.find(r => r.rule === 'PROVENANCE');
      expect(provenance?.status).toBe('PASS');

      expect(ultrawideEvidence.source_coordinates?.segment_start_index).toBe(101);
    });

    test('KEDUA evidence diterima dan resolve ke segmen berbeda — bukan lagi sama-sama di-drop', () => {
      const evidenceA: EvidenceItem = { ...selfieEvidence };
      const evidenceB: EvidenceItem = { ...ultrawideEvidence };
      const reportA = EvidenceValidator.validate(evidenceA, context);
      const reportB = EvidenceValidator.validate(evidenceB, context);

      expect(reportA.accepted).toBe(true);
      expect(reportB.accepted).toBe(true);

      // Bukti bahwa keduanya benar-benar di-resolve ke occurrence BERBEDA,
      // bukan sekadar "dua-duanya diterima dengan coordinates kebetulan sama".
      expect(evidenceA.source_coordinates?.segment_start_index).toBe(96);
      expect(evidenceB.source_coordinates?.segment_start_index).toBe(101);
    });
  });
});

// ============================================================
// REGRESSION TEST (CALON) — PARALLEL_DEVICE_SPEC_AMBIGUITY
// ============================================================
// Tujuan: membuktikan gap GROUNDING/PROVENANCE yang ditemukan dari
// log production (Test Gemini temperature 0.0, Chunk #2, kategori
// kuarantine "Ambiguous") -- BUKAN reimplementasi logika, memanggil
// GroundingValidator, ProvenanceValidator, dan EvidenceValidator
// production ASLI.
//
// AKAR MASALAH (hipotesis yang diuji di sini):
// findSourceMatches() (search.ts) mencari kecocokan literal SECARA
// GLOBAL di seluruh chunk, tanpa mempertimbangkan urutan/posisi
// relatif terhadap subjek yang disebut evidence. Ketika dua device
// paralel (kamera selfie vs ultrawide) dideskripsikan dengan frasa
// spesifikasi template yang literal identik ("bukaan f/2.2",
// "fixed focus", "up to 1080p 30 fps" -- masing-masing muncul PERSIS
// 2x di chunk yang sama, sekali per device), validator otomatis
// menganggap SEMUA excerpt pendek semacam itu ambigu, walau
// evidence yang bersangkutan sebenarnya benar dan atomik.
//
// FIXTURE: segmen 95-103 disalin verbatim dari
// "INPUT External/transcript.srt" (Samsung Galaxy A26 5G review).
// chunkIndex/timestamps dipertahankan sesuai SRT asli.
//
// Status test ini: NEGATIVE ASSERTION. Test-test di bagian A dan B
// SENGAJA meng-assert bug ADA (SUSPECT/quarantine), bukan assert
// perilaku yang benar -- sama seperti pola D-13/smoke-shared-
// predicate sebelumnya. Kalau nanti fix (Opsi A/B/C, belum
// diputuskan) diimplementasikan, assertion di bagian A & B akan
// GAGAL -- itu tandanya fix bekerja, dan assertion harus dibalik
// saat itu terjadi.
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

describe('PARALLEL_DEVICE_SPEC_AMBIGUITY — bukti gap (belum diperbaiki)', () => {

  // ============================================================
  // BAGIAN A — GroundingValidator: excerpt pendek template-sama
  // ============================================================
  describe('A. GroundingValidator salah menandai SUSPECT untuk excerpt valid', () => {

    test('BUG: "bukaan f/2.2" muncul di segmen 96 (selfie) DAN 101 (ultrawide) → SUSPECT HIGH', () => {
      const result = GroundingValidator.validate('bukaan f/2.2', context);
      // Seharusnya salah satu/keduanya PASS karena masing-masing merujuk
      // device berbeda -- saat ini keduanya divonis ambigu.
      expect(result.status).toBe('SUSPECT');
      expect(result.severity).toBe('HIGH');
    });

    test('BUG: "fixed focus" muncul di segmen 96 (selfie) DAN 102 (ultrawide) → SUSPECT HIGH', () => {
      const result = GroundingValidator.validate('fixed focus', context);
      expect(result.status).toBe('SUSPECT');
      expect(result.severity).toBe('HIGH');
    });

    test('BUG: "up to 1080p 30 fps" muncul di segmen 97 (selfie) DAN 102 (ultrawide) → SUSPECT HIGH', () => {
      const result = GroundingValidator.validate('up to 1080p 30 fps', context);
      expect(result.status).toBe('SUSPECT');
      expect(result.severity).toBe('HIGH');
    });
  });

    // ============================================================
  // BAGIAN B — ProvenanceValidator: coordinates gagal ter-resolve
  // ============================================================
  describe('B. ProvenanceValidator gagal resolve coordinates untuk kasus yang sama', () => {

    test('BUG: "bukaan f/2.2" → coordinates null, status SUSPECT', () => {
      const result = ProvenanceValidator.resolve('bukaan f/2.2', null, context);
      expect(result.coordinates).toBeNull();
      expect(result.result.status).toBe('SUSPECT');
    });

    test('BUG: "fixed focus" → coordinates null, status SUSPECT', () => {
      const result = ProvenanceValidator.resolve('fixed focus', null, context);
      expect(result.coordinates).toBeNull();
      expect(result.result.status).toBe('SUSPECT');
    });
  });

  // ============================================================
  // BAGIAN C — KONTROL: bukan seluruh validator rusak, hanya frasa
  // pendek yang template-sama antar device paralel yang bermasalah.
  // ============================================================
  describe('C. Kontrol — excerpt yang cukup spesifik tetap PASS (bug ini sempit, bukan meltdown validator)', () => {

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
  // BAGIAN D — END-TO-END: bukti data loss nyata lewat EvidenceValidator
  // ============================================================
  // Mereplikasi persis pola production: dua evidence ATOMIK dan BENAR
  // (satu tentang selfie, satu tentang ultrawide), masing-masing pakai
  // source_excerpt pendek yang templatenya sama -- seperti yang
  // dihasilkan model di 5/6 run pada log kemarin.
  // ============================================================
  describe('D. Dampak nyata: dua evidence sah ikut ter-quarantine (data loss)', () => {

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

    test('BUG: evidence selfie (bukaan f/2.2) ter-quarantine walau faktanya benar', () => {
      const report: EvidenceValidationReport = EvidenceValidator.validate(selfieEvidence, context);
      expect(report.accepted).toBe(false);
      expect(report.quarantineReason).toContain('GROUNDING');
    });

    test('BUG: evidence ultrawide (bukaan f/2.2) JUGA ter-quarantine walau faktanya benar dan berbeda dari selfie', () => {
      const report: EvidenceValidationReport = EvidenceValidator.validate(ultrawideEvidence, context);
      expect(report.accepted).toBe(false);
      expect(report.quarantineReason).toContain('GROUNDING');
    });

    test('BUG: KEDUANYA hilang -- bukan cuma satu yang di-drop, dua-duanya, yang berarti fakta selfie DAN ultrawide sama-sama tidak sampai ke evidence final', () => {
      const reportA = EvidenceValidator.validate({ ...selfieEvidence }, context);
      const reportB = EvidenceValidator.validate({ ...ultrawideEvidence }, context);
      expect(reportA.accepted).toBe(false);
      expect(reportB.accepted).toBe(false);
    });
  });
});

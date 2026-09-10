import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import dotenv from 'dotenv';

// Pasca E3.D
import {
  parseSRT,
  buildEvidenceChunks,
  buildChunkText,
  parseEvidenceJSON,
  buildMetadataContext,
  getReviewerName,
  buildEvidenceInstruction,
  PRODUCTION_SYSTEM_INSTRUCTION_EVIDENCE,
  type ReviewMetadata
} from './src/evidence/production-pipeline';

// 🔥 IMPOR PROMPT BARU YANG SUDAH DIPISAH
import { ANALYSIS_PROMPT_SUMMARY, ANALYSIS_PROMPT_EVIDENCE } from './prompts';

// ==========================================
// IMPOR VALIDATOR LAYER PHASE A & B
// ==========================================
import { EvidenceValidator } from './src/evidence/validators/evidence-validator';
import { DuplicateValidator } from './src/evidence/validators/duplicate';
import type { DuplicateResult } from './src/evidence/validators/duplicate';
import type {
  EvidenceContext,
  EvidenceItem,
  EvidenceValidationReport
} from './src/evidence/types';
import type { SRTSegment } from './src/evidence/srt';
import { normalizeForSearch } from './src/evidence/srt';

// 📦 Impor unified LLM provider
import { callLLMAPI, callLLMWithFallback, getActiveProvider } from './src/llm/llm-provider';

dotenv.config();

const app = express();
const PORT = 5000;
app.use(express.json({ limit: '10mb' }));

// ==========================================
// 1. TIPE DATA & KONFIGURASI TEMPLATE
// ==========================================
interface PromptTemplate {
  id: string;
  name: string;
  instruction: string;
}

let PROMPT_TEMPLATES: PromptTemplate[] = [];
try {
  const templatesData = fs.readFileSync('./promptTemplates.json', 'utf8');
  PROMPT_TEMPLATES = JSON.parse(templatesData) as PromptTemplate[];
} catch (err) {
  console.error('Gagal memuat promptTemplates.json:', err);
}

// ==========================================
// 2. KONFIGURASI KAMUS / DICTIONARY
// ==========================================
const DICTIONARY_DIR = path.join(process.cwd(), 'dictionaries');
if (!fs.existsSync(DICTIONARY_DIR)) {
  fs.mkdirSync(DICTIONARY_DIR, { recursive: true });
  console.log(`✅ Folder dictionaries berhasil dibuat di ${DICTIONARY_DIR}`);
}

function safeReadJSON(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) { return {}; }
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    if (!fileContent || fileContent.trim() === '') { return {}; }
    return JSON.parse(fileContent);
  } catch (err) {
    console.warn(`⚠️ File JSON ${filePath} tidak valid atau rusak, mengabaikan dan memulai baru.`);
    return {};
  }
}

// ==========================================
// 3. HELPER AI FUNCTIONS — SUDAH DIGANTI DENGAN UNIFIED LLM PROVIDER
// ==========================================

// ==========================================
// FUNGSI GENERATE SUMMARY (TERPISAH)
// ==========================================
async function generateSummary(
  srtContent: string,
  metadata: ReviewMetadata = {},
  reviewerName: string = 'Reviewer'
): Promise<string> {
  const segments = parseSRT(srtContent);
  if (segments.length === 0) {
    throw new Error('Format transcript.srt tidak valid atau tidak memiliki segment.');
  }

  const resolvedReviewerName = getReviewerName(metadata, reviewerName);
  const metadataContext = buildMetadataContext(metadata);
  const fullText = segments.map(seg => seg.text).join(' ');

  const summaryInstruction =
    `IDENTITAS REVIEW:\n${metadataContext || `Channel/Reviewer: ${resolvedReviewerName}`}\n\n` +
    `SOURCE OF TRUTH: transcript.srt.\n` +
    `Metadata hanya digunakan untuk identitas review dan konteks administratif.\n` +
    `Jangan menggunakan metadata sebagai evidence isi produk.\n\n` +
    ANALYSIS_PROMPT_SUMMARY;

  // Primary = gemini, fallback = groq
  const result = await callLLMWithFallback(
    fullText,
    summaryInstruction,
    'Anda adalah perangkum produk yang objektif. Gunakan transcript sebagai satu-satunya sumber isi review.',
    'gemini',
    ['groq']
  );

  if (!result.success) {
    throw new Error(result.error || 'Gagal mendapatkan summary dari LLM');
  }
  return result.content;
}

// ==========================================
// FUNGSI EXTRACT EVIDENCE (TERPISAH)
// ==========================================
async function extractEvidence(
  srtContent: string,
  metadata: ReviewMetadata = {},
  reviewerName: string = 'Reviewer'
): Promise<{
  evidence: EvidenceItem[];
  quarantine: Array<{ evidence: EvidenceItem; reason?: string; chunkIndex: number }>;
  duplicateRemoved: Array<{ evidence_id: string; reason: string; kept_evidence_id: string }>;
  duplicateMerged: Array<{ evidence_id_a: string; evidence_id_b: string; merged_evidence_id: string; reason: string }>;
  stats: {
    totalExtracted: number;
    duplicateRemoved: number;
    mergedCount: number;
    finalCount: number;
    quarantineCount: number;
  };
}> {
  // Parse SRT
  const segments = parseSRT(srtContent);
  if (segments.length === 0) {
    throw new Error('Format transcript.srt tidak valid atau tidak memiliki segment.');
  }

  const resolvedReviewerName = getReviewerName(metadata, reviewerName);
  const metadataContext = buildMetadataContext(metadata);

  // Chunking dengan ukuran lebih kecil (8000 karakter) dan overlap 2 segmen
  const evidenceChunks = buildEvidenceChunks(segments, 8000, 2);
  console.log(`📦 Evidence extraction akan menggunakan ${evidenceChunks.length} chunk.`);

  let allEvidence: EvidenceItem[] = [];
  let quarantineSequence = 0;
  const quarantinedEvidence: Array<{
    evidence: EvidenceItem;
    reason?: string;
    chunkIndex: number;
  }> = [];

  // Loop per chunk
  for (let chunkIndex = 0; chunkIndex < evidenceChunks.length; chunkIndex++) {
    const chunk = evidenceChunks[chunkIndex];
    const batchNumber = chunkIndex + 1;
    const totalBatches = evidenceChunks.length;

    console.log(`📦 Mengekstrak Chunk Evidence ke-${batchNumber}/${totalBatches} ...`);

    // 🔥 LOG RENTANG SEGMEN
    const firstSegment = chunk[0];
    const lastSegment = chunk[chunk.length - 1];
    const totalSegments = chunk.length;
    console.log(
      `   📍 Segmen ${firstSegment.index} → ${lastSegment.index} ` +
      `(${firstSegment.start} → ${lastSegment.end})`
    );
    console.log(`   📏 Jumlah segmen: ${totalSegments}`);

    // 🔥 BUILD CHUNK TEXT DAN HITUNG KARAKTER
    const chunkText = buildChunkText(chunk);
    const charLength = chunkText.length;
    console.log(`📏 Chunk ${batchNumber} - Karakter: ${charLength}, Estimasi Token: ~${Math.ceil(charLength / 4)}`);

    const evidenceInstruction = buildEvidenceInstruction(
      metadata,
      reviewerName,
      batchNumber,
      totalBatches
    );

    try {
      const result = await callLLMWithFallback(
        chunkText,
        evidenceInstruction,
        PRODUCTION_SYSTEM_INSTRUCTION_EVIDENCE,
        'gemini',
        ['groq']
      );

      if (!result.success) {
        throw new Error(result.error || 'Gagal mengekstrak evidence dari LLM');
      }

      const rawOutput = result.content;
      const chunkEvidence = parseEvidenceJSON(rawOutput);
      const validEvidence = chunkEvidence.filter(isValidEvidence);

      if (validEvidence.length === 0) {
        console.log(`⚠️ Chunk ke-${batchNumber} tidak menghasilkan evidence valid.`);
        continue;
      }

      for (const ev of validEvidence) {
        const context: EvidenceContext = {
          chunkIndex,
          chunkText,
          chunkSegments: chunk
        };

        const report: EvidenceValidationReport = EvidenceValidator.validate(ev, context);

        if (report.accepted) {
          allEvidence.push({
            ...ev,
            validation: report
          });
        } else {
          quarantineSequence++;
          quarantinedEvidence.push({
            evidence: {
              ...ev,
              evidence_id: `Q${String(quarantineSequence).padStart(3, '0')}`
            },
            reason: report.quarantineReason,
            chunkIndex
          });
        }
      }

      console.log(`✅ Chunk ke-${batchNumber} selesai. Total valid: ${allEvidence.length}, Quarantine: ${quarantinedEvidence.length}`);
    } catch (err) {
      console.error(`❌ Gagal memproses Chunk ke-${batchNumber}:`, err);
      continue;
    }

    // Jeda 5 detik agar tidak kena rate limit Groq (meskipun primary gemini, fallback tetap groq)
    if (chunkIndex < evidenceChunks.length - 1) {
      console.log(`⏳ Menunggu 5 detik sebelum chunk berikutnya...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  // Assign ID
  const identifiedEvidence = assignEvidenceIds(allEvidence);
  console.log(`🏷️ Evidence ID telah di-assign: ${identifiedEvidence.length} evidence.`);

  // Duplicate Gate
  const duplicateResult = DuplicateValidator.detect(identifiedEvidence);
  const { preservedEvidence, duplicateRemovedDetails, duplicateMergedDetails } =
    resolveDuplicateActions(identifiedEvidence, duplicateResult);

  console.log(`🧹 Duplicate gate selesai: ${identifiedEvidence.length} -> ${preservedEvidence.length}`);

  // Tambahkan timestamp & metadata
  const finalEvidence = preservedEvidence.map(ev => {
    const timestamp = ev.source_coordinates
      ? getTimestampFromCoordinates(ev.source_coordinates, segments)
      : { timestamp_start: null, timestamp_end: null };

    return {
      ...ev,
      timestamp_start: timestamp.timestamp_start,
      timestamp_end: timestamp.timestamp_end,
      source: resolvedReviewerName,
      review_id: metadata.id ?? null,
      video_url: metadata.url ?? null,
      video_title: metadata.title ?? null
    };
  });

  const duplicateRemovedCount = duplicateRemovedDetails.length;
  const mergedCount = duplicateMergedDetails.length;

  return {
    evidence: finalEvidence,
    quarantine: quarantinedEvidence,
    duplicateRemoved: duplicateRemovedDetails,
    duplicateMerged: duplicateMergedDetails,
    stats: {
      totalExtracted: identifiedEvidence.length,
      duplicateRemoved: duplicateRemovedCount,
      mergedCount,
      finalCount: finalEvidence.length,
      quarantineCount: quarantinedEvidence.length
    }
  };
}

// ==========================================
// 4. API ROUTES (FITUR CLEANING & KAMUS)
// ==========================================
app.get('/api/templates', (req, res) => {
  const templateList = PROMPT_TEMPLATES.map(({ id, name }) => ({ id, name }));
  res.json(templateList);
});

app.post('/api/correct-text', async (req, res) => {
  try {
    const { text, mode, templateId, customInstruction } = req.body;
    if (!text) return res.status(400).json({ error: 'Teks kosong' });
    let promptInstruction = '';
    const systemInstruction = `Anda adalah ahli penyunting tata bahasa...`;
    try {
      const result = await callLLMAPI(
        text,
        promptInstruction,
        systemInstruction,
        getActiveProvider()
      );
      if (!result.success) throw new Error(result.error);
      const correctedText = result.content;
      return res.json({ success: true, correctedText, mode });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/dictionary/add', async (req, res) => {
  return res.json({ success: true, message: 'OK' });
});

app.get('/api/dictionary/:name', (req, res) => {
  return res.json({});
});


// --------------------------------------------------
// VALIDASI EVIDENCE DASAR
// --------------------------------------------------

export function isValidEvidence(ev: any): boolean {
  if (
    !ev ||
    typeof ev !== 'object' ||
    Array.isArray(ev)
  ) {
    return false;
  }

  return (
    typeof ev.claim === 'string' &&
    ev.claim.trim().length > 0
  );
}

// --------------------------------------------------
// EVIDENCE ID
// --------------------------------------------------

export function assignEvidenceIds(
  evidence: EvidenceItem[]
): EvidenceItem[] {
  return evidence.map((ev, index) => ({
    ...ev,
    evidence_id: `E${String(index + 1).padStart(3, '0')}`
  }));
}

// --------------------------------------------------
// TIMESTAMP DARI SOURCE COORDINATES
// --------------------------------------------------

function getTimestampFromCoordinates(
  coordinates: NonNullable<EvidenceItem['source_coordinates']>,
  segments: SRTSegment[]
): {
  timestamp_start: string | null;
  timestamp_end: string | null;
} {
  const startSegment = segments.find(
    segment => segment.index === coordinates.segment_start_index
  );

  const endSegment = segments.find(
    segment => segment.index === coordinates.segment_end_index
  );

  if (!startSegment || !endSegment) {
    return {
      timestamp_start: null,
      timestamp_end: null
    };
  }

  return {
    timestamp_start: startSegment.start,
    timestamp_end: endSegment.end
  };
}

// --------------------------------------------------
// RESOLUSI DUPLICATE GATE
// --------------------------------------------------

export interface DuplicateResolutionOutput {
  preservedEvidence: EvidenceItem[];
  duplicateRemovedDetails: Array<{
    evidence_id: string;
    reason: string;
    kept_evidence_id: string;
  }>;
  duplicateMergedDetails: Array<{
    evidence_id_a: string;
    evidence_id_b: string;
    merged_evidence_id: string;
    reason: string;
  }>;
}

export function resolveDuplicateActions(
  identifiedEvidence: EvidenceItem[],
  duplicateResult: DuplicateResult
): DuplicateResolutionOutput {
  const removedEvidenceIds = new Set<string>();
  const duplicateRemovedDetails: DuplicateResolutionOutput['duplicateRemovedDetails'] = [];

  const mergedEvidenceToAdd: EvidenceItem[] = [];
  const duplicateMergedDetails: DuplicateResolutionOutput['duplicateMergedDetails'] = [];

  for (const resolution of duplicateResult.duplicatePairs) {
    if (resolution.action === 'PRESERVE') continue;

    if (resolution.action === 'MERGE') {
      if (!resolution.mergedEvidence) {
        console.warn(
          `⚠️ Resolution MERGE tanpa mergedEvidence untuk ` +
          `${resolution.evidence_id_a}/${resolution.evidence_id_b}, dilewati (PRESERVE fallback).`
        );
        continue;
      }

      removedEvidenceIds.add(resolution.evidence_id_a);
      removedEvidenceIds.add(resolution.evidence_id_b);
      mergedEvidenceToAdd.push(resolution.mergedEvidence);

      duplicateMergedDetails.push({
        evidence_id_a: resolution.evidence_id_a,
        evidence_id_b: resolution.evidence_id_b,
        merged_evidence_id:
          resolution.mergedEvidence.evidence_id || resolution.evidence_id_a,
        reason: resolution.reason
      });

      continue;
    }

    let evidenceIdToRemove: string | null = null;
    let keptId: string | null = null;

    if (resolution.action === 'KEEP_BEST') {
      const lower = resolution.reason.toLowerCase();
      if (lower.includes('a lebih') || lower.includes('a memiliki')) {
        keptId = resolution.evidence_id_a;
        evidenceIdToRemove = resolution.evidence_id_b;
      } else if (lower.includes('b lebih') || lower.includes('b memiliki')) {
        keptId = resolution.evidence_id_b;
        evidenceIdToRemove = resolution.evidence_id_a;
      } else {
        keptId = resolution.evidence_id_a;
        evidenceIdToRemove = resolution.evidence_id_b;
      }
    } else if (resolution.action === 'KEEP_FIRST') {
      keptId = resolution.evidence_id_a;
      evidenceIdToRemove = resolution.evidence_id_b;
    }

    if (evidenceIdToRemove) {
      removedEvidenceIds.add(evidenceIdToRemove);
      duplicateRemovedDetails.push({
        evidence_id: evidenceIdToRemove,
        reason: resolution.reason,
        kept_evidence_id: keptId || '',
      });
    }
  }

  const preservedEvidence = identifiedEvidence
    .filter(ev => !removedEvidenceIds.has(ev.evidence_id || ''))
    .concat(mergedEvidenceToAdd);

  return { preservedEvidence, duplicateRemovedDetails, duplicateMergedDetails };
}

// --------------------------------------------------
// ANALYZE REVIEW (Endpoint utama)
// --------------------------------------------------

app.post('/api/analyze-review', async (req, res) => {
  try {
    const { metadata = {}, srtContent, reviewerName = 'Reviewer' } = req.body;

    if (!srtContent || typeof srtContent !== 'string') {
      return res.status(400).json({
        error: 'Konten transcript.srt kosong atau tidak valid.'
      });
    }

    const [summary, evidenceResult] = await Promise.all([
      generateSummary(srtContent, metadata, reviewerName),
      extractEvidence(srtContent, metadata, reviewerName)
    ]);

    return res.json({
      success: true,
      metadata,
      summary,
      evidence: evidenceResult.evidence,
      quarantine: evidenceResult.quarantine,
      duplicateRemoved: evidenceResult.duplicateRemoved,
      duplicateMerged: evidenceResult.duplicateMerged,
      stats: evidenceResult.stats
    });

  } catch (error: any) {
    console.error('❌ Error in analyze-review:', error);
    return res.status(500).json({
      error: error?.message || 'Terjadi kesalahan pada server.'
    });
  }
});

// ==========================================
// ENDPOINT: GENERATE SUMMARY SAJA
// ==========================================
app.post('/api/summary', async (req, res) => {
  try {
    const { srtContent, metadata = {}, reviewerName = 'Reviewer' } = req.body;
    if (!srtContent || typeof srtContent !== 'string') {
      return res.status(400).json({ error: 'srtContent wajib diisi dan berupa string.' });
    }

    const summary = await generateSummary(srtContent, metadata, reviewerName);
    res.json({ success: true, summary });
  } catch (error: any) {
    console.error('❌ Error di /api/summary:', error);
    res.status(500).json({ error: error.message || 'Terjadi kesalahan pada server.' });
  }
});

// ==========================================
// ENDPOINT: EXTRACT EVIDENCE SAJA
// ==========================================
app.post('/api/evidence', async (req, res) => {
  try {
    const { srtContent, metadata = {}, reviewerName = 'Reviewer' } = req.body;
    if (!srtContent || typeof srtContent !== 'string') {
      return res.status(400).json({ error: 'srtContent wajib diisi dan berupa string.' });
    }

    const result = await extractEvidence(srtContent, metadata, reviewerName);
    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('❌ Error di /api/evidence:', error);
    res.status(500).json({ error: error.message || 'Terjadi kesalahan pada server.' });
  }
});

// ==========================================
// 6. START SERVER
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }
  app.listen(PORT, '0.0.0.0', () => console.log(`Server running on http://0.0.0.0:${PORT}`));
}

if (!process.env.VITEST) {
  startServer();
}

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

dotenv.config();

const app = express();
const PORT = 3000;
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
// 3. HELPER AI FUNCTIONS
// ==========================================

async function callGeminiAPI(
  text: string,
  promptInstruction: string,
  systemInstruction: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY tidak ditemukan.');
  }

  const model = 'gemini-3.5-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{ parts: [{ text: `${promptInstruction}\n\n--- TEKS UNTUK DIKOREKSI ---\n${text}` }] }],
    system_instruction: { parts: [{ text: systemInstruction }] },
    generationConfig: { 
      temperature: 0.1,
      topP: 0.9,
      topK: 1,
      candidateCount: 1
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Gemini Raw Error Response:', errorText);
    throw new Error(`Gemini API Error (Status ${response.status}): ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  if (!candidate || !candidate.content || !candidate.content.parts || !candidate.content.parts[0].text) {
    throw new Error('Gemini mengembalikan respons yang tidak valid atau kosong.');
  }
  return candidate.content.parts[0].text.trim();
}

// Helper Groq (Fallback)
async function callGroqAPI(
  text: string,
  promptInstruction: string,
  systemInstruction: string
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) { throw new Error('GROQ_API_KEY tidak ditemukan.'); }
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: `${promptInstruction}\n\n--- TEKS UNTUK DIKOREKSI ---\n${text}` },
      ],
      temperature: 0.1,
    }),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || `Groq API Error: ${response.status}`);
  }
  const data = await response.json();
  return data.choices[0].message.content.trim();
}

// ==========================================
// 4. API ROUTES (FITUR CLEANING & KAMUS) - (TIDAK BERUBAH)
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
      const correctedText = await callGeminiAPI(text, promptInstruction, systemInstruction);
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
// RESOLUSI DUPLICATE GATE — diekstrak dari route handler supaya
// bisa diuji terpisah (smoke test) tanpa perlu Express/network call.
// PERILAKU TIDAK BERUBAH dari kode inline sebelumnya, cuma dipindah.
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
      // Coba tentukan mana yang dipertahankan berdasarkan reason dari LLM
      const lower = resolution.reason.toLowerCase();
      if (lower.includes('a lebih') || lower.includes('a memiliki')) {
        keptId = resolution.evidence_id_a;
        evidenceIdToRemove = resolution.evidence_id_b;
      } else if (lower.includes('b lebih') || lower.includes('b memiliki')) {
        keptId = resolution.evidence_id_b;
        evidenceIdToRemove = resolution.evidence_id_a;
      } else {
        // Fallback: jika tidak ada indikasi, hapus B (karena A adalah yang pertama)
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
        reason: resolution.reason, // Gunakan alasan asli dari LLM
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
// ANALYZE REVIEW
// --------------------------------------------------

app.post('/api/analyze-review', async (req, res) => {
  try {
    const {
      metadata: rawMetadata = {},
      srtContent,
      reviewerName = 'Reviewer'
    } = req.body;

    const metadata: ReviewMetadata =
      rawMetadata && typeof rawMetadata === 'object'
        ? rawMetadata
        : {};

    if (!srtContent || typeof srtContent !== 'string') {
      return res.status(400).json({
        error: 'Konten transcript.srt kosong atau tidak valid.'
      });
    }

    // ==================================================
    // 1. PARSING SRT
    // ==================================================

    const segments = parseSRT(srtContent);

    if (segments.length === 0) {
      return res.status(400).json({
        error: 'Format transcript.srt tidak valid atau tidak memiliki segment.'
      });
    }

    const resolvedReviewerName =
      getReviewerName(metadata, reviewerName);

    const metadataContext =
      buildMetadataContext(metadata);

    const fullText = segments
      .map(segment => segment.text)
      .join(' ');

    console.log(
      `🎬 Transcript berhasil diparsing: ${segments.length} segment.`
    );

    // ==================================================
    // 2. TAHAP 1 — REVIEW SUMMARY
    // ==================================================

    const summaryInstruction =
      `IDENTITAS REVIEW:\\n${metadataContext || `Channel/Reviewer: ${resolvedReviewerName}`}\\n\\n` +
      `SOURCE OF TRUTH: transcript.srt.\\n` +
      `Metadata hanya digunakan untuk identitas review dan konteks administratif.\\n` +
      `Jangan menggunakan metadata sebagai evidence isi produk.\\n\\n` +
      ANALYSIS_PROMPT_SUMMARY;

    let summary = '';

    try {
      summary = await callGeminiAPI(
        fullText,
        summaryInstruction,
        'Anda adalah perangkum produk yang objektif. Gunakan transcript sebagai satu-satunya sumber isi review.'
      );
    } catch (err) {
      console.error('❌ Gagal membuat summary:', err);
      summary = 'Gagal menghasilkan ringkasan.';
    }

    // ==================================================
    // 3. TAHAP 2 — EVIDENCE EXTRACTION + VALIDATION
    // ==================================================

    const evidenceChunks =
      buildEvidenceChunks(
        segments,
        18000,
        3
      );

    console.log(
      `📦 Evidence extraction akan menggunakan ${evidenceChunks.length} chunk.`
    );

    let allEvidence: EvidenceItem[] = [];

    let quarantineSequence = 0;
    
    const quarantinedEvidence: Array<{
      evidence: EvidenceItem;
      reason?: string;
      chunkIndex: number;
    }> = [];

    for (
      let chunkIndex = 0;
      chunkIndex < evidenceChunks.length;
      chunkIndex++
    ) {
      const chunk = evidenceChunks[chunkIndex];

      const batchNumber = chunkIndex + 1;
      const totalBatches = evidenceChunks.length;

      console.log(
        `📦 Mengekstrak Chunk Evidence ke-${batchNumber}/${totalBatches} ` +
        `(segment ${chunk[0].index}-${chunk[chunk.length - 1].index})...`
      );

      const chunkText = buildChunkText(chunk);

      const evidenceInstruction = buildEvidenceInstruction(
        metadata,
        reviewerName,
        batchNumber,
        totalBatches
      );

      try {
        const rawOutput = await callGeminiAPI(
          chunkText,
          evidenceInstruction,
          PRODUCTION_SYSTEM_INSTRUCTION_EVIDENCE
        );

        // 🔥 ADD THIS FOR DEBUGGING
        console.log(`[CHUNK ${batchNumber}] RAW_OUTPUT:`, JSON.stringify({
          chunkIndex,
          chunkText: chunkText.substring(0, 200) + '...',
          rawOutput: rawOutput.substring(0, 1000) + '...',
          timestamp: new Date().toISOString()
        }));
        // ... End DEBUGGING

        const chunkEvidence = parseEvidenceJSON(rawOutput);
        const validEvidence = chunkEvidence.filter(isValidEvidence);

        if (validEvidence.length === 0) {
          console.log(
            `⚠️ Chunk ke-${batchNumber} tidak menghasilkan evidence valid.`
          );
          continue;
        }

        for (const ev of validEvidence) {
          const context: EvidenceContext = {
            chunkIndex,
            chunkText,
            chunkSegments: chunk
          };

          const report: EvidenceValidationReport =
            EvidenceValidator.validate(ev, context);

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

        console.log(
          `✅ Chunk ke-${batchNumber} berhasil menambah evidence valid. ` +
          `Total sementara: ${allEvidence.length}. ` +
          `Quarantine: ${quarantinedEvidence.length}.`
        );
      } catch (err) {
        console.error(`❌ Gagal memproses Chunk ke-${batchNumber}:`, err);
        continue;
      }
    }

    if (quarantinedEvidence.length > 0) {
      console.warn(
        `🚫 Total evidence di-quarantine: ${quarantinedEvidence.length}`,
        quarantinedEvidence.map(q => q.reason)
      );
    }

    // ==================================================
    // 4. ASSIGN EVIDENCE ID SEBELUM DUPLICATE GATE
    // ==================================================

    const identifiedEvidence = assignEvidenceIds(allEvidence);

    console.log(
      `🏷️ Evidence ID telah di-assign: ${identifiedEvidence.length} evidence.`
    );

    // ==================================================
    // 5. DUPLICATE GATE (PHASE B) + SAVE DETAILS
    // ==================================================

    const duplicateResult = DuplicateValidator.detect(identifiedEvidence);
    const {
      preservedEvidence,
      duplicateRemovedDetails,
      duplicateMergedDetails
    } = resolveDuplicateActions(identifiedEvidence, duplicateResult);

    console.log(
      `🧹 Duplicate gate selesai: ${identifiedEvidence.length} -> ${preservedEvidence.length}`
    );

    // ==================================================
    // 6. TIMESTAMP + SOURCE + FINAL OUTPUT
    // ==================================================

    const finalEvidence = preservedEvidence.map(ev => {
      const timestamp = ev.source_coordinates
        ? getTimestampFromCoordinates(ev.source_coordinates, segments)
        : {
            timestamp_start: null,
            timestamp_end: null
          };

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

    console.log(
      `✅ Total final evidence: ${finalEvidence.length}`
    );
    // Tambah di server.ts sebelum res.json() line 598:
console.log(JSON.stringify({
  phase: 'FINAL_STATS',
  totalExtracted: identifiedEvidence.length,
  afterValidation: allEvidence.length, // before dedup
  quarantined: quarantinedEvidence.length,
  duplicateRemoved: duplicateRemovedDetails.length,
  duplicateMerged: duplicateMergedDetails.length,
  finalCount: finalEvidence.length,
  // DEBUG: detail setiap kandidat duplicate
  duplicateCandidates: duplicateResult.candidates.map(c => ({
    idA: c.evidenceA.evidence_id,
    idB: c.evidenceB.evidence_id,
    similarity: c.similarity,
    reasons: c.reasons
  }))
}, null, 2));
    
    // ==================================================
    // 7. RESPONSE + STATS
    // ==================================================
    // const duplicateRemoved = identifiedEvidence.length - preservedEvidence.length;
    // Dihitung dari duplicateRemovedDetails.length (bukan selisih total),
    // supaya MERGE tidak ikut terhitung sebagai "removed" -- lihat
    // rangkuman audit bagian 11.3/11.4 #7 untuk konteks kenapa field ini
    // sebelumnya menyesatkan (2 evidence -> 1 hasil MERGE dulu dilaporkan
    // sebagai "1 removed", padahal tidak ada informasi yang hilang).
    const duplicateRemoved = duplicateRemovedDetails.length;

    return res.json({
      success: true,
      metadata,
      summary,
      evidence: finalEvidence,
      quarantine: quarantinedEvidence,
      duplicateRemoved: duplicateRemovedDetails,
      duplicateMerged: duplicateMergedDetails,
      stats: {
        totalExtracted: identifiedEvidence.length,
        duplicateRemoved,
        mergedCount: duplicateMergedDetails.length,
        finalCount: finalEvidence.length,
        quarantineCount: quarantinedEvidence.length
      }
    });

  } catch (error: any) {
    console.error('❌ Error in analyze-review:', error);
    return res.status(500).json({
      error: error?.message || 'Terjadi kesalahan pada server.'
    });
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

// Guard: startServer() hanya dijalankan di luar konteks test.
// Vitest otomatis men-set process.env.VITEST saat menjalankan test
// suite -- ini dipakai di sini (bukan perbandingan import.meta.url
// vs process.argv[1]) karena perbandingan URL/path rawan bug
// platform-dependent di Windows (drive letter encoding di file://,
// backslash vs forward-slash). Tanpa guard ini, meng-import server.ts
// untuk keperluan test akan ikut men-start Express server + vite
// middleware sebagai side effect yang tidak diinginkan (bentrok port,
// proses menggantung, dsb).
if (!process.env.VITEST) {
  startServer();
}

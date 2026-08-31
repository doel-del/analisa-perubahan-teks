import * as Diff from 'diff';
import {
  DiffGranularity,
  DiffPart,
  DiffSummary,
  TextChangeItem,
  ChangeType
} from '../types';

/**
 * Calculates diff parts based on granularity (words, lines, characters)
 */
export function calculateDiffParts(
  original: string,
  modified: string,
  granularity: DiffGranularity
): DiffPart[] {
  let rawDiff: Diff.Change[];

  if (granularity === 'words') {
    rawDiff = Diff.diffWordsWithSpace(original, modified);
  } else if (granularity === 'lines') {
    rawDiff = Diff.diffLines(original, modified);
  } else {
    rawDiff = Diff.diffChars(original, modified);
  }

  // Convert to DiffPart with unique IDs
  return rawDiff.map((part, idx) => ({
    id: `diff-part-${idx}-${Date.now()}`,
    value: part.value,
    added: Boolean(part.added),
    removed: Boolean(part.removed),
    count: part.count
  }));
}

/**
 * Generates interactive TextChangeItems ("keterangan perubahan text") from DiffParts
 * Merges adjacent removed+added into a single "modified/replaced" item for better readability
 */
export function generateChangeItems(parts: DiffPart[]): {
  changeItems: TextChangeItem[];
  annotatedParts: DiffPart[];
} {
  const changeItems: TextChangeItem[] = [];
  const annotatedParts: DiffPart[] = [...parts.map((p) => ({ ...p }))];

  let changeIndex = 1;
  let i = 0;

  while (i < annotatedParts.length) {
    const current = annotatedParts[i];

    // Case 1: Replacement (Removed immediately followed by Added)
    if (
      current.removed &&
      i + 1 < annotatedParts.length &&
      annotatedParts[i + 1].added
    ) {
      const removedPart = current;
      const addedPart = annotatedParts[i + 1];

      removedPart.changeIndex = changeIndex;
      addedPart.changeIndex = changeIndex;

      const oldClean = removedPart.value.trim();
      const newClean = addedPart.value.trim();

      const shortOld =
        oldClean.length > 60 ? oldClean.slice(0, 60) + '…' : oldClean;
      const shortNew =
        newClean.length > 60 ? newClean.slice(0, 60) + '…' : newClean;

      const description = `Diganti dari "${shortOld || '(spasi)'}" menjadi "${shortNew || '(spasi)'}"`;

      changeItems.push({
        id: `change-${changeIndex}`,
        index: changeIndex,
        type: 'modified',
        oldText: removedPart.value,
        newText: addedPart.value,
        description,
        partIds: [removedPart.id, addedPart.id],
        wordCount: countWords(addedPart.value),
        charCount: addedPart.value.length
      });

      changeIndex++;
      i += 2;
      continue;
    }

    // Case 2: Pure Removal
    if (current.removed) {
      current.changeIndex = changeIndex;
      const cleanText = current.value.trim();
      const shortText =
        cleanText.length > 70 ? cleanText.slice(0, 70) + '…' : cleanText;

      changeItems.push({
        id: `change-${changeIndex}`,
        index: changeIndex,
        type: 'removed',
        oldText: current.value,
        description: `Dihapus: "${shortText || '(spasi/baris kosong)'}"`,
        partIds: [current.id],
        wordCount: countWords(current.value),
        charCount: current.value.length
      });

      changeIndex++;
      i++;
      continue;
    }

    // Case 3: Pure Addition
    if (current.added) {
      current.changeIndex = changeIndex;
      const cleanText = current.value.trim();
      const shortText =
        cleanText.length > 70 ? cleanText.slice(0, 70) + '…' : cleanText;

      changeItems.push({
        id: `change-${changeIndex}`,
        index: changeIndex,
        type: 'added',
        newText: current.value,
        description: `Ditambahkan: "${shortText || '(spasi/baris kosong)'}"`,
        partIds: [current.id],
        wordCount: countWords(current.value),
        charCount: current.value.length
      });

      changeIndex++;
      i++;
      continue;
    }

    // Unchanged part
    i++;
  }

  return { changeItems, annotatedParts };
}

/**
 * Computes summary statistics between original and modified text
 */
export function calculateDiffSummary(
  original: string,
  modified: string,
  parts: DiffPart[]
): DiffSummary {
  const originalWordCount = countWords(original);
  const modifiedWordCount = countWords(modified);
  const originalCharCount = original.length;
  const modifiedCharCount = modified.length;

  let addedWords = 0;
  let removedWords = 0;
  let addedChars = 0;
  let removedChars = 0;
  let unchangedChars = 0;

  for (const part of parts) {
    const wCount = countWords(part.value);
    const cCount = part.value.length;

    if (part.added) {
      addedWords += wCount;
      addedChars += cCount;
    } else if (part.removed) {
      removedWords += wCount;
      removedChars += cCount;
    } else {
      unchangedChars += cCount;
    }
  }

  const totalLength = Math.max(originalCharCount, modifiedCharCount);
  const similarityPercent =
    totalLength === 0
      ? 100
      : Math.round(
          Math.max(0, Math.min(100, (unchangedChars / totalLength) * 100))
        );

  const totalChanges = parts.filter((p) => p.added || p.removed).length;

  return {
    similarityPercent,
    totalChanges,
    addedWords,
    removedWords,
    addedChars,
    removedChars,
    originalWordCount,
    modifiedWordCount,
    originalCharCount,
    modifiedCharCount
  };
}

export function countWords(text: string): number {
  if (!text || !text.trim()) return 0;
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
}

export function countLines(text: string): number {
  if (!text) return 0;
  return text.split(/\r\n|\r|\n/).length;
}

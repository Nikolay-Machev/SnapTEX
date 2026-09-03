export function normalizeLatex(latex: string): string {
  return latex
    .replace(/^\$\$?|\$\$?$/g, "")
    .replace(/\s+/g, "")
    .replace(/\\left|\\right/g, "")
    .trim();
}

export function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}

export function characterErrorRate(expected: string, predicted: string): number {
  const normalizedExpected = normalizeLatex(expected);
  const normalizedPredicted = normalizeLatex(predicted);
  return levenshteinDistance(normalizedExpected, normalizedPredicted) /
    Math.max(normalizedExpected.length, 1);
}

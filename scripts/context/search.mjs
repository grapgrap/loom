// Use Lucene's positive IDF so terms shared by most records remain searchable.
// https://lucene.apache.org/core/9_12_1/core/org/apache/lucene/search/similarities/BM25Similarity.html
const termFrequencySaturation = 1.2;
const documentLengthNormalization = 0.75;

function tokenizeSearchText(text) {
  const words =
    text
      .normalize("NFKC")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.flatMap((word) => {
    if (!/^[가-힣]{3,}$/.test(word)) return [word];
    return [word, ...Array.from({ length: word.length - 1 }, (_, i) => word.slice(i, i + 2))];
  });
}

export function extractSearchText(source) {
  return [
    source.text,
    source.reason,
    source.goal,
    source.progress,
    ...(source.evidence ?? []),
    ...(source.next ?? []),
    source.source?.reference,
  ]
    .filter(Boolean)
    .join("\n");
}

export function rankSourcesByQuery(originalSources, query, resultLimit) {
  const queryTerms = [...new Set(tokenizeSearchText(query))];
  if (!queryTerms.length) return [];
  const documents = originalSources
    .filter((source) => !source.forgotten)
    .map((source) => {
      const searchText = extractSearchText(source);
      const documentTokens = tokenizeSearchText(searchText);
      const termFrequencies = new Map();
      for (const token of documentTokens)
        termFrequencies.set(token, (termFrequencies.get(token) ?? 0) + 1);
      return { source, searchText, tokenCount: documentTokens.length, termFrequencies };
    });
  if (!documents.length) return [];
  const averageTokenCount =
    documents.reduce((sum, document) => sum + document.tokenCount, 0) / documents.length || 1;
  const documentFrequencies = new Map(
    queryTerms.map((term) => [
      term,
      documents.filter(({ termFrequencies }) => termFrequencies.has(term)).length,
    ]),
  );
  return documents
    .map(({ source, searchText, tokenCount, termFrequencies }) => {
      let score = 0;
      for (const term of queryTerms) {
        const termFrequency = termFrequencies.get(term) ?? 0;
        if (!termFrequency) continue;
        const matchingDocumentCount = documentFrequencies.get(term);
        const inverseDocumentFrequency = Math.log(
          1 + (documents.length - matchingDocumentCount + 0.5) / (matchingDocumentCount + 0.5),
        );
        score +=
          (inverseDocumentFrequency * termFrequency * (termFrequencySaturation + 1)) /
          (termFrequency +
            termFrequencySaturation *
              (1 -
                documentLengthNormalization +
                (documentLengthNormalization * tokenCount) / averageTokenCount));
      }
      const { ref, kind, scope, recordedAt, latest } = source;
      return {
        ref,
        kind,
        scope,
        recordedAt,
        ...(latest === undefined ? {} : { latest }),
        score,
        excerpt: searchText.slice(0, 800),
      };
    })
    .filter(({ score }) => score > 0)
    .sort(
      (leftResult, rightResult) =>
        rightResult.score - leftResult.score || leftResult.ref.localeCompare(rightResult.ref),
    )
    .slice(0, resultLimit);
}

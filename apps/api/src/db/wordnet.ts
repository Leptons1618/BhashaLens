/**
 * Parser for the Bangla WordNet YAML release
 * (soumenganguly/Bangla-Wordnet, GPL-3.0).
 *
 * The file is a flat list of synsets:
 *
 *   -
 *    ID: 1
 *    CAT: ADJECTIVE
 *    CONCEPT: যে জন্মগ্রহণ করেনি
 *    EXAMPLE: "সে অজাত"
 *    SYNSET-BENGALI: অজাত, অনুত্পন্ন, অনুদ্ভূত
 *
 * It is deliberately simple YAML, so a tiny line parser avoids a PyYAML/YAML
 * dependency. Multi-word entries use underscores (`পবিত্র_স্থান`), which are
 * normalized back to spaces for display.
 */

export interface WordNetSynset {
  category: string;
  concept: string;
  example: string;
  id: string;
  words: string[];
}

function stripQuotes(value: string): string {
  return value.replace(/^"(.*)"$/u, "$1").trim();
}

function toSynset(fields: Record<string, string>): WordNetSynset {
  return {
    category: fields.CAT ?? "",
    concept: fields.CONCEPT ?? "",
    example: stripQuotes(fields.EXAMPLE ?? ""),
    id: fields.ID ?? "",
    words: (fields["SYNSET-BENGALI"] ?? "")
      .split(",")
      .map((word) => word.trim().replace(/_/gu, " "))
      .filter((word) => word.length > 0)
  };
}

export function parseWordNetYaml(text: string): WordNetSynset[] {
  const synsets: WordNetSynset[] = [];
  let fields: Record<string, string> = {};

  const flush = (): void => {
    if (Object.keys(fields).length > 0) {
      const synset = toSynset(fields);
      if (synset.words.length > 0 && synset.concept.length > 0) {
        synsets.push(synset);
      }
      fields = {};
    }
  };

  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trimEnd();
    if (line.trim().length === 0 || line.trimStart().startsWith("#")) {
      continue;
    }

    if (line.startsWith("-")) {
      flush();
      continue;
    }

    const colon = line.indexOf(":");
    if (colon === -1) {
      continue;
    }

    fields[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }

  flush();
  return synsets;
}

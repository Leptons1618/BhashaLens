import { BengaliAdapter } from "@bhashalens/core";
import { describe, expect, it } from "vitest";
import { benchmarkForms, groupFor } from "./benchmark-lemmatization.js";

describe("groupFor", () => {
  it("classifies verb tags separately from nominal ones", () => {
    expect(groupFor(["first-person", "past"])).toBe("verb");
    expect(groupFor(["genitive", "definite"])).toBe("nominal");
  });
});

describe("benchmarkForms", () => {
  it("measures rule lemmatization with the form table hidden", () => {
    const forms = [
      { form: "বাংলার", lemma: "বাংলা", tags: ["genitive"] },
      { form: "গেলাম", lemma: "যাওয়া", tags: ["first-person", "past"] },
      { form: "বাংলা", lemma: "বাংলা", tags: ["noun"] }
    ];
    const dictionary = new Set(["বাংলা", "যাওয়া"]);
    const result = benchmarkForms(forms, dictionary, new BengaliAdapter());

    expect(result.overall.total).toBe(3);
    expect(result.overall.exactHeadword).toBe(1);
    expect(result.overall.scorable).toBe(2);
    // বাংলার → বাংলা resolves by rules; irregular গেলাম does not.
    expect(result.overall.lemmaAnyScorable).toBe(1);
    expect(result.byGroup.verb.total).toBe(1);
    expect(result.byGroup.nominal.total).toBe(2);
    expect(result.failures[0]?.form).toBe("গেলাম");
  });
});

import { describe, expect, it } from "vitest";
import { tierForScore } from "./scoring";

describe("tierForScore", () => {
  it("clasifica por umbrales", () => {
    expect(tierForScore(85)).toBe("high");
    expect(tierForScore(70)).toBe("high");
    expect(tierForScore(55)).toBe("medium");
    expect(tierForScore(10)).toBe("low");
  });
});

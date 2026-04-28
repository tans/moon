// tests/parser.test.ts
import { describe, it, expect } from "bun:test";
import { parseRequest } from "../src/parser";

describe("parser", () => {
  it("should parse OpenAI request", () => {
    const result = parseRequest({
      tier: "L1",
      model: "gpt-4",
      messages: [{ role: "user", content: "hello" }],
      stream: false,
    }, "L2");

    expect(result.tier).toBe("L1");
    expect(result.model).toBe("gpt-4");
    expect(result.messages).toHaveLength(1);
    expect(result.stream).toBe(false);
  });

  it("should use default tier when not specified", () => {
    const result = parseRequest({
      model: "claude-3",
      messages: [],
    }, "L3");

    expect(result.tier).toBe("L3");
    expect(result.model).toBe("claude-3");
  });
});
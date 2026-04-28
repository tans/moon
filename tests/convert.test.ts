import { describe, it, expect } from "bun:test";
import { convertRequest } from "../src/convert";

describe("convert", () => {
  it("should convert OpenAI to Anthropic", () => {
    const openaiReq = {
      model: "L1",
      messages: [{ role: "user", content: "hello" }],
    };

    const result = convertRequest(openaiReq, "anthropic", "claude-opus-4");

    expect(result.provider).toBe("anthropic");
    expect(result.body.model).toBe("claude-opus-4");
    expect(result.body.prompt).toContain("user: hello");
  });

  it("should pass through when formats match", () => {
    const openaiReq = {
      model: "L1",
      messages: [{ role: "user", content: "hello" }],
    };

    const result = convertRequest(openaiReq, "openai", "gpt-4o");

    expect(result.provider).toBe("openai");
    expect(result.body.model).toBe("gpt-4o");
  });
});
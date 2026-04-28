import { describe, it, expect } from "bun:test";
import { createApiKey } from "../src/auth";
import { db } from "../src/db";

describe("auth", () => {
  it("should create api key", () => {
    const key = createApiKey("test-user", "L1");
    expect(key).toMatch(/^moon_[a-f0-9]{32}$/);
  });
});
import { describe, expect, it } from "vitest";
import { isYamlWarningsActive } from "../../logic/features";

describe("YAML Warnings Feature", () => {
  it("should evaluate warnings active status accurately", () => {
    expect(isYamlWarningsActive(false)).toBe(false);
    expect(typeof isYamlWarningsActive(true)).toBe("boolean");
  });
});

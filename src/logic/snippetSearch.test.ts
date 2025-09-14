import { describe, expect, it } from "vitest";
import { searchSnippets, SearchScope, SearchableConfigPreview } from "./snippetSearch";

describe("searchSnippets", () => {
  const samplePreviews: SearchableConfigPreview[] = [
    {
      config: {
        path: "/path/to/default.yml",
        relativePath: "default.yml",
        name: "default.yml",
      },
      snippets: [
        {
          trigger: ":hello",
          replace: "Hello World",
          description: "Greeting message",
        },
        {
          triggers: [":date", ":today"],
          replace: "YYYY-MM-DD",
          description: "Current date format",
        },
        {
          trigger: ":logo",
          image_path: "/assets/logo.png",
          description: "Company logo",
        },
      ],
    },
    {
      config: {
        path: "/path/to/work/emails.yml",
        relativePath: "work/emails.yml",
        name: "emails.yml",
      },
      snippets: [
        {
          trigger: ":sig",
          replace: "Best regards,\nJohn Doe",
          description: "Work Email Signature",
        },
        {
          trigger: ":form",
          form: "Name: [[name]]",
          description: "User input form",
        },
      ],
    },
  ];

  const fullScope: SearchScope = {
    trigger: true,
    description: true,
    content: true,
  };

  it("returns empty array for empty or whitespace query", () => {
    expect(searchSnippets(samplePreviews, "", fullScope)).toEqual([]);
    expect(searchSnippets(samplePreviews, "   ", fullScope)).toEqual([]);
  });

  it("returns empty array when all scopes are disabled", () => {
    const disabledScope: SearchScope = {
      trigger: false,
      description: false,
      content: false,
    };
    expect(searchSnippets(samplePreviews, "hello", disabledScope)).toEqual([]);
  });

  it("searches by trigger only", () => {
    const triggerScope: SearchScope = {
      trigger: true,
      description: false,
      content: false,
    };
    const results = searchSnippets(samplePreviews, ":today", triggerScope);
    expect(results).toHaveLength(1);
    expect(results[0].snippet.description).toBe("Current date format");
    expect(results[0].matchedFields).toEqual(["trigger"]);
  });

  it("searches by description only", () => {
    const descScope: SearchScope = {
      trigger: false,
      description: true,
      content: false,
    };
    const results = searchSnippets(samplePreviews, "Greeting", descScope);
    expect(results).toHaveLength(1);
    expect(results[0].snippet.trigger).toBe(":hello");
    expect(results[0].matchedFields).toEqual(["description"]);
  });

  it("searches by content (replace / form / image) only", () => {
    const contentScope: SearchScope = {
      trigger: false,
      description: false,
      content: true,
    };
    const results = searchSnippets(samplePreviews, "logo.png", contentScope);
    expect(results).toHaveLength(1);
    expect(results[0].snippet.trigger).toBe(":logo");
    expect(results[0].matchedFields).toEqual(["content"]);
  });

  it("matches across multiple fields and marks matchedFields correctly", () => {
    const results = searchSnippets(samplePreviews, "input form", fullScope);
    expect(results).toHaveLength(1);
    expect(results[0].snippet.trigger).toBe(":form");
    expect(results[0].matchedFields).toEqual(["description"]);

    // Test multiple matched fields on single item using trigger ":hello" with replacement "Hello World" and desc "Greeting message"
    const multiMatchResults = searchSnippets(samplePreviews, "hello", fullScope);
    expect(multiMatchResults).toHaveLength(1);
    expect(multiMatchResults[0].matchedFields).toEqual(["trigger", "content"]);
  });

  it("is case-insensitive", () => {
    const results = searchSnippets(samplePreviews, "BEST REGARDS", fullScope);
    expect(results).toHaveLength(1);
    expect(results[0].snippet.trigger).toBe(":sig");
  });
});

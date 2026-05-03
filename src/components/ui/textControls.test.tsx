import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Input } from "./input";
import { Textarea } from "./textarea";

describe("text controls", () => {
  it("disables browser text assistance on inputs by default", () => {
    render(<Input aria-label="Trigger" />);

    const input = screen.getByLabelText("Trigger");

    expect(input).toHaveAttribute("spellcheck", "false");
    expect(input).toHaveAttribute("autocorrect", "off");
    expect(input).toHaveAttribute("autocapitalize", "off");
    expect(input).toHaveAttribute("autocomplete", "off");
  });

  it("disables browser text assistance on textareas by default", () => {
    render(<Textarea aria-label="Replacement" />);

    const textarea = screen.getByLabelText("Replacement");

    expect(textarea).toHaveAttribute("spellcheck", "false");
    expect(textarea).toHaveAttribute("autocorrect", "off");
    expect(textarea).toHaveAttribute("autocapitalize", "off");
    expect(textarea).toHaveAttribute("autocomplete", "off");
  });

  it("allows a field to opt back into text assistance explicitly", () => {
    render(
      <Input
        aria-label="Search"
        spellCheck
        autoCorrect="on"
        autoCapitalize="sentences"
        autoComplete="on"
      />,
    );

    const input = screen.getByLabelText("Search");

    expect(input).toHaveAttribute("spellcheck", "true");
    expect(input).toHaveAttribute("autocorrect", "on");
    expect(input).toHaveAttribute("autocapitalize", "sentences");
    expect(input).toHaveAttribute("autocomplete", "on");
  });
});

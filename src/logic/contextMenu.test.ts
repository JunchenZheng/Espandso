import { describe, expect, it, vi } from "vitest";
import { installGlobalContextMenuBlocker } from "./contextMenu";

describe("installGlobalContextMenuBlocker", () => {
  it("prevents native context menus globally", () => {
    const target = new EventTarget();
    const remove = installGlobalContextMenuBlocker(target);
    const event = new Event("contextmenu", { cancelable: true });

    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    remove();
  });

  it("returns a cleanup function for removing the listener", () => {
    const target = new EventTarget();
    const remove = installGlobalContextMenuBlocker(target);
    remove();
    const event = new Event("contextmenu", { cancelable: true });

    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it("uses a capture-phase listener", () => {
    const target = new EventTarget();
    const addEventListener = vi.spyOn(target, "addEventListener");
    const removeEventListener = vi.spyOn(target, "removeEventListener");

    const remove = installGlobalContextMenuBlocker(target);
    remove();

    expect(addEventListener).toHaveBeenCalledWith(
      "contextmenu",
      expect.any(Function),
      { capture: true },
    );
    expect(removeEventListener).toHaveBeenCalledWith(
      "contextmenu",
      expect.any(Function),
      { capture: true },
    );
  });
});

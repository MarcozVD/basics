import { describe, expect, it } from "vitest";
import { type DesktopKeyEvent, desktopKeyAction, isEditableTarget } from "../src/lib/desktop-shell";

const key = (init: Partial<DesktopKeyEvent>): DesktopKeyEvent => ({
  key: "",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  target: null,
  ...init,
});

const input = { tagName: "INPUT" } as unknown as EventTarget;

/** Stands in for a node inside CodeMirror without needing jsdom. */
const editor = {
  tagName: "DIV",
  isContentEditable: false,
  closest: (selector: string) => (selector === ".cm-editor" ? { tagName: "DIV" } : null),
} as unknown as EventTarget;

const page = { tagName: "BODY", isContentEditable: false } as unknown as EventTarget;

describe("isEditableTarget", () => {
  it("accepts the fields where a keypress types text", () => {
    expect(isEditableTarget(input)).toBe(true);
    expect(isEditableTarget({ tagName: "textarea" } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: "SELECT" } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget(editor)).toBe(true);
  });

  it("rejects the page itself and anything without a DOM shape", () => {
    expect(isEditableTarget(page)).toBe(false);
    expect(isEditableTarget({ tagName: "DIV" } as unknown as EventTarget)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(undefined)).toBe(false);
  });
});

describe("desktopKeyAction", () => {
  it("turns Ctrl/Cmd+F into the app's own search", () => {
    expect(desktopKeyAction(key({ key: "f", ctrlKey: true, target: page }))).toBe("search");
    expect(desktopKeyAction(key({ key: "F", metaKey: true, target: page }))).toBe("search");
  });

  it("blocks the browser actions a desktop window must not have", () => {
    for (const pressed of [
      key({ key: "p", ctrlKey: true, target: page }),
      key({ key: "P", metaKey: true, target: page }),
      key({ key: "r", ctrlKey: true, target: page }),
      key({ key: "R", ctrlKey: true, shiftKey: true, target: page }),
      key({ key: "g", ctrlKey: true, target: page }),
      key({ key: "G", ctrlKey: true, shiftKey: true, target: page }),
      key({ key: "u", ctrlKey: true, target: page }),
      key({ key: "j", ctrlKey: true, target: page }),
      key({ key: "h", ctrlKey: true, target: page }),
      key({ key: "F3", target: page }),
      key({ key: "F5", target: page }),
      key({ key: "F7", target: page }),
      key({ key: "+", ctrlKey: true, shiftKey: true, target: page }),
      key({ key: "=", ctrlKey: true, target: page }),
      key({ key: "-", ctrlKey: true, target: page }),
      key({ key: "_", ctrlKey: true, shiftKey: true, target: page }),
      key({ key: "0", ctrlKey: true, target: page }),
    ]) {
      expect(desktopKeyAction(pressed), `${pressed.key} with modifiers`).toBe("block");
    }
  });

  it("blocks Ctrl/Cmd+S except inside the editor, which saves the note itself", () => {
    expect(desktopKeyAction(key({ key: "s", ctrlKey: true, target: page }))).toBe("block");
    expect(desktopKeyAction(key({ key: "s", metaKey: true, target: input }))).toBe("block");
    expect(desktopKeyAction(key({ key: "s", ctrlKey: true, target: editor }))).toBeNull();
  });

  it("blocks Alt+Left/Right history but keeps Option+Arrow caret movement in a field", () => {
    expect(desktopKeyAction(key({ key: "ArrowLeft", altKey: true, target: page }))).toBe("block");
    expect(desktopKeyAction(key({ key: "ArrowRight", altKey: true, target: page }))).toBe("block");
    expect(desktopKeyAction(key({ key: "ArrowLeft", altKey: true, target: input }))).toBeNull();
    expect(desktopKeyAction(key({ key: "ArrowLeft", metaKey: true, target: page }))).toBeNull();
  });

  it("leaves typing, text editing and the app's own shortcuts alone", () => {
    for (const pressed of [
      key({ key: "f", target: input }),
      key({ key: "p", target: input }),
      key({ key: "g", target: page }),
      key({ key: "s", target: input }),
      key({ key: "c", ctrlKey: true, target: page }),
      key({ key: "v", ctrlKey: true, target: page }),
      key({ key: "x", ctrlKey: true, target: page }),
      key({ key: "a", ctrlKey: true, target: page }),
      key({ key: "z", ctrlKey: true, target: page }),
      key({ key: "k", ctrlKey: true, target: page }),
      key({ key: "Escape", target: page }),
      key({ key: "Enter", target: page }),
      key({ key: "ArrowDown", target: page }),
    ]) {
      expect(desktopKeyAction(pressed), `${JSON.stringify(pressed)}`).toBeNull();
    }
  });

  it("keeps macOS Ctrl+F as a caret key inside a field, where Cmd+F still searches", () => {
    const mac = { macos: true };
    expect(desktopKeyAction(key({ key: "f", ctrlKey: true, target: input }), mac)).toBeNull();
    expect(desktopKeyAction(key({ key: "p", ctrlKey: true, target: input }), mac)).toBeNull();
    expect(desktopKeyAction(key({ key: "f", metaKey: true, target: input }), mac)).toBe("search");
    expect(desktopKeyAction(key({ key: "f", ctrlKey: true, target: page }), mac)).toBe("search");
    // Outside a field Ctrl+F is not a caret key even on macOS.
    expect(desktopKeyAction(key({ key: "p", ctrlKey: true, target: page }), mac)).toBe("block");
  });

  it("ignores keys that arrive without a name", () => {
    expect(desktopKeyAction(key({ key: "" }))).toBeNull();
  });
});

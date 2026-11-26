import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TagPicker, type TagPickerEvent } from "./TagPicker";
import type { LoadOptions } from "./TagPicker";

const OPTIONS = ["Figma", "React", "TypeScript", "CSS", "Prototyping", "Vue", "Next.js"];

type Props = Partial<React.ComponentProps<typeof TagPicker>>;

/** The picker, controlled, with a place to read its value back. */
function Harness({ initial = ["Figma", "React"], ...props }: Props & { initial?: string[] }) {
  const [value, setValue] = useState(initial);
  return (
    <form aria-label="demo">
      <TagPicker options={OPTIONS} value={value} onChange={setValue} name="skills" {...props} />
      <output aria-label="value">{value.join(",")}</output>
    </form>
  );
}
const value = () => screen.getByLabelText("value").textContent;
const input = () => screen.getByRole("combobox", { name: "Skills" });

describe("typing and suggestions", () => {
  it("Enter adds the highlighted suggestion, not the raw text", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), "typesc{Enter}");
    expect(value()).toBe("Figma,React,TypeScript");
  });

  it("arrow keys move the highlight", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[]} />);
    await user.type(input(), "c");
    const first = screen.getAllByRole("option")[0];
    expect(first).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    expect(input()).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[1].id);
  });

  it("a comma commits the tag and pasting a list adds every item", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[]} allowCustom />);
    await user.type(input(), "Rust,");
    expect(value()).toBe("Rust");
    await user.click(input());
    await user.paste("css, vue, nope-not-a-thing");
    expect(value()).toBe("Rust,CSS,Vue");
  });

  it("does not add the same tag twice, ignoring case", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), "react,");
    expect(value()).toBe("Figma,React");
  });

  it("refuses tags over the budget and says how much room is left", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["Figma"]} maxChars={12} />);
    await user.type(input(), "TypeScript,");
    expect(value()).toBe("Figma");
    expect(screen.getAllByText(/needs 10 characters, only 7 left/).length).toBeGreaterThan(0);
  });
});

describe("removing and history", () => {
  it("Backspace needs two presses, and Undo restores", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(input());
    await user.keyboard("{Backspace}");
    expect(value()).toBe("Figma,React");
    await user.keyboard("{Backspace}");
    expect(value()).toBe("Figma");
    await user.click(screen.getAllByRole("button", { name: "Undo" })[0]);
    expect(value()).toBe("Figma,React");
  });

  it("Clear all can be undone and redone", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(value()).toBe("");
    await user.click(screen.getAllByRole("button", { name: "Undo" })[0]);
    expect(value()).toBe("Figma,React");
    await user.click(screen.getByRole("button", { name: "Redo" }));
    expect(value()).toBe("");
  });
});

describe("reordering", () => {
  it("Alt + arrow keys move a tag and keep focus on it", async () => {
    const user = userEvent.setup();
    render(<Harness featuredCount={2} />);
    const remove = screen.getByRole("button", { name: "Remove React" });
    remove.focus();
    await user.keyboard("{Alt>}{ArrowLeft}{/Alt}");
    expect(value()).toBe("React,Figma");
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove React" })).toHaveFocus());
    await user.keyboard("{Alt>}{End}{/Alt}");
    expect(value()).toBe("Figma,React");
  });

  it("does nothing at the edges", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole("button", { name: "Remove Figma" }).focus();
    await user.keyboard("{Alt>}{ArrowLeft}{/Alt}");
    expect(value()).toBe("Figma,React");
  });
});

describe("analytics events", () => {
  it("reports where an add came from and why something was rejected", async () => {
    const user = userEvent.setup();
    const events: TagPickerEvent[] = [];
    render(<Harness onEvent={(e) => events.push(e)} maxTagLength={12} />);
    await user.type(input(), "vue{Enter}");
    expect(events).toContainEqual({ type: "add", tag: "Vue", source: "suggestion", position: 0, query: "vue" });
    await user.type(input(), "waytoolongtag,");
    expect(events).toContainEqual({ type: "reject", reason: "too_long", text: "waytoolongtag" });
    await user.click(screen.getByRole("button", { name: /^Prototyping/ }));
    expect(events).toContainEqual({ type: "add", tag: "Prototyping", source: "catalog" });
  });
});

describe("online search", () => {
  const load: LoadOptions = vi.fn(async (query) =>
    query.startsWith("ru") ? [{ value: "Rust", label: "Rust", group: "eng" }] : []);

  it("shows online results after the debounce and adds the picked one", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[]} loadOptions={load} searchDelay={10} />);
    await user.type(input(), "rus");
    expect(await screen.findByRole("option", { name: /Rust/ })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /Rust/ }));
    expect(value()).toBe("Rust");
  });

  it("shows an error with a retry when the request fails", async () => {
    const user = userEvent.setup();
    let fail = true;
    const flaky: LoadOptions = async () => {
      if (fail) throw new Error("offline");
      return [{ value: "Rust", label: "Rust" }];
    };
    render(<Harness initial={[]} loadOptions={flaky} searchDelay={10} />);
    await user.type(input(), "ru");
    expect(await screen.findByText("Could not load more skills.")).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("option", { name: /Rust/ })).toBeInTheDocument();
  });
});

describe("form states", () => {
  it("required uses native validation until something is picked", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[]} required requiredMessage="Pick one" />);
    expect(input()).toBeRequired();
    expect((input() as HTMLInputElement).validationMessage).toBe("Pick one");
    expect((screen.getByRole("form") as HTMLFormElement).checkValidity()).toBe(false);
    await user.type(input(), "css{Enter}");
    expect((input() as HTMLInputElement).validity.valid).toBe(true);
  });

  it("read only shows plain tags with no input and no remove buttons", () => {
    render(<Harness readOnly />);
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
    expect(within(screen.getByRole("list", { name: "Selected skills" })).getAllByRole("listitem")).toHaveLength(2);
    expect(document.querySelector('input[name="skills"]')).not.toBeDisabled();
  });

  it("disabled is not submitted with the form", () => {
    render(<Harness disabled />);
    expect(document.querySelector('input[name="skills"]')).toBeDisabled();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("shows an error passed in from outside", () => {
    render(<Harness error="Skills could not be saved" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Skills could not be saved");
  });
});

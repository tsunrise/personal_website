import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import App from "./App";
import userEvent from "@testing-library/user-event";
import { SalieriBackend, StreamItem } from "./components/salieri/service";

jest.mock("./components/landscape/Landscape", () => ({
  __esModule: true,
  default: () => null,
}));
let mockTurnstileHandlers: any;
const mockCaptchaReset = jest.fn();
jest.mock("@marsidev/react-turnstile", () => {
  const React = require("react");
  return {
    Turnstile: React.forwardRef((props: any, ref: any) => {
      mockTurnstileHandlers = props;
      React.useImperativeHandle(ref, () => ({ reset: mockCaptchaReset }));
      return (
        <div data-testid="verification-challenge">Verification challenge</div>
      );
    }),
  };
});
function fixture() {
  let update: (item: StreamItem) => void = () => {};
  const backend: SalieriBackend = {
    getHints: jest.fn(async () => ({
      welcome: "Hello",
      suggested_questions: ["What does Tom enjoy?"],
      announcement: "An announcement",
    })),
    subscribeToAnswer: jest.fn((q, t, onUpdate) => {
      update = onUpdate;
      return jest.fn();
    }),
  };
  return { backend, emit: (item: StreamItem) => update(item) };
}
beforeEach(() => {
  window.history.replaceState({}, "", "/");
  localStorage.clear();
  window.matchMedia = jest.fn().mockImplementation(() => ({
    matches: false,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
  window.scrollTo = jest.fn();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
test("resting view is minimal; focus reveals hints; social links remain correct", async () => {
  const { backend } = fixture();
  render(<App backend={backend} />);
  await waitFor(() => expect(backend.getHints).toHaveBeenCalled());
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Tom Shen",
  );
  expect(screen.getByRole("link", { name: "github" })).toHaveAttribute(
    "href",
    "https://github.com/tsunrise",
  );
  expect(screen.getByRole("link", { name: "linkedin" })).toHaveAttribute(
    "href",
    "https://www.linkedin.com/in/conghao-shen/",
  );
  expect(screen.queryByText("What does Tom enjoy?")).not.toBeInTheDocument();
  fireEvent.focus(screen.getByRole("textbox", { name: "Ask about Tom" }));
  expect(
    await screen.findByRole("button", { name: /What does Tom enjoy/ }),
  ).toBeInTheDocument();
  expect(screen.getByText("An announcement")).toBeInTheDocument();
});
test("touching a suggestion keeps input focus until the prompt is filled", async () => {
  const { backend } = fixture();
  const user = userEvent.setup();
  render(<App backend={backend} />);
  const input = screen.getByRole("textbox", { name: "Ask about Tom" });
  await user.click(input);
  const suggestion = await screen.findByRole("button", {
    name: /What does Tom enjoy/,
  });
  await user.pointer({ keys: "[TouchA>]", target: suggestion });
  expect(input).toHaveFocus();
  expect(suggestion).toBeInTheDocument();
  await user.pointer({ keys: "[/TouchA]", target: suggestion });
  expect(input).toHaveValue("What does Tom enjoy?");
  expect(input).toHaveFocus();
  expect(backend.subscribeToAnswer).not.toHaveBeenCalled();
});
test("suggestions remain selectable with the keyboard", async () => {
  const { backend } = fixture();
  const user = userEvent.setup();
  render(<App backend={backend} />);
  const input = screen.getByRole("textbox", { name: "Ask about Tom" });
  await user.click(input);
  const suggestion = await screen.findByRole("button", {
    name: /What does Tom enjoy/,
  });
  await user.tab();
  expect(suggestion).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(input).toHaveValue("What does Tom enjoy?");
  expect(input).toHaveFocus();
});
test("an iOS tap fills a suggestion even if the input blurs before touchend and no click arrives", async () => {
  const { backend } = fixture();
  render(<App backend={backend} />);
  const input = screen.getByRole("textbox", { name: "Ask about Tom" });
  act(() => input.focus());
  const suggestion = await screen.findByRole("button", {
    name: /What does Tom enjoy/,
  });
  const touch = { identifier: 1, clientX: 80, clientY: 200 };
  fireEvent.touchStart(suggestion, { touches: [touch] });
  act(() => input.blur());
  expect(input).not.toHaveFocus();
  expect(suggestion).toBeInTheDocument();
  expect(
    fireEvent.touchEnd(suggestion, {
      touches: [],
      changedTouches: [touch],
    }),
  ).toBe(false); // Prevent the delayed compatibility click.
  expect(input).toHaveValue("What does Tom enjoy?");
  expect(input).toHaveFocus();
  expect(backend.subscribeToAnswer).not.toHaveBeenCalled();
});
test.each(["scroll", "cancel"])(
  "a suggestion touch used to %s does not select a question",
  async (gesture) => {
    const { backend } = fixture();
    render(<App backend={backend} />);
    const input = screen.getByRole("textbox", { name: "Ask about Tom" });
    act(() => input.focus());
    const suggestion = await screen.findByRole("button", {
      name: /What does Tom enjoy/,
    });
    const touch = { identifier: 1, clientX: 80, clientY: 200 };
    fireEvent.touchStart(suggestion, { touches: [touch] });
    act(() => input.blur());
    if (gesture === "scroll") {
      const moved = { ...touch, clientY: 240 };
      expect(fireEvent.touchMove(suggestion, { touches: [moved] })).toBe(true);
      fireEvent.touchEnd(suggestion, { touches: [], changedTouches: [moved] });
    } else
      fireEvent.touchCancel(suggestion, {
        touches: [],
        changedTouches: [touch],
      });
    expect(input).toHaveValue("");
    expect(input).not.toHaveFocus();
    expect(suggestion).not.toBeInTheDocument();
  },
);
test("WeChat dialog dismisses with Escape and restores focus", async () => {
  const { backend } = fixture();
  render(<App backend={backend} />);
  const button = screen.getByRole("button", { name: "wechat" });
  button.focus();
  fireEvent.click(button);
  expect(
    screen.getByRole("dialog", { name: "Find me on WeChat" }),
  ).toBeVisible();
  expect(screen.getByAltText("Tom Shen’s WeChat QR code")).toBeVisible();
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { bubbles: true, cancelable: true }),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(button).toHaveFocus();
  await waitFor(() => expect(backend.getHints).toHaveBeenCalled());
});
test("verification, max length, and IME gate submission; answers expand in place", async () => {
  const f = fixture();
  render(<App backend={f.backend} />);
  const input = screen.getByRole("textbox", { name: "Ask about Tom" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "Question" } });
  expect(screen.getByRole("button", { name: "Send question" })).toBeDisabled();
  act(() => mockTurnstileHandlers.onSuccess("test-token"));
  expect(screen.getByRole("button", { name: "Send question" })).toBeEnabled();
  fireEvent.compositionStart(input);
  fireEvent.keyDown(input, { key: "Enter", keyCode: 13 });
  expect(f.backend.subscribeToAnswer).not.toHaveBeenCalled();
  fireEvent.compositionEnd(input);
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
  expect(f.backend.subscribeToAnswer).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "x".repeat(301) } });
  expect(screen.getByRole("button", { name: "Send question" })).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("Please shorten");
  fireEvent.change(input, { target: { value: "Question" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(f.backend.subscribeToAnswer).toHaveBeenCalledWith(
    "Question",
    "test-token",
    expect.any(Function),
    expect.any(Function),
  );
  expect(screen.getByRole("link", { name: "github" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Ask about Tom" })).toBe(input);
  expect(input).not.toHaveAttribute("readonly");
  expect(input).toHaveValue("Question");
  expect(
    screen.queryByRole("button", {
      name: /Ask another question|Cancel answer/,
    }),
  ).not.toBeInTheDocument();
  act(() => f.emit({ type: "delta", delta: "A streamed answer." }));
  expect(
    screen.queryByRole("button", {
      name: /Ask another question|Cancel answer/,
    }),
  ).not.toBeInTheDocument();
  act(() => {
    f.emit({ type: "stop", stop_reason: "finish" });
  });
  expect(screen.getByText("A streamed answer.")).toBeInTheDocument();
  expect(screen.queryByText(/Salieri/i)).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Copy link" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Share" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Ask another question" }),
  ).not.toBeInTheDocument();
  expect(window.location.pathname).toBe("/");
  fireEvent.change(input, { target: { value: "Second question" } });
  expect(screen.queryByText("A streamed answer.")).not.toBeInTheDocument();
  expect(input).toHaveValue("Second question");
  expect(screen.getByRole("button", { name: "Send question" })).toBeDisabled();
  act(() => mockTurnstileHandlers.onSuccess("fresh-token"));
  fireEvent.keyDown(input, { key: "Enter" });
  expect(f.backend.subscribeToAnswer).toHaveBeenCalledTimes(2);
  act(() => f.emit({ type: "stop", stop_reason: "finish" }));
  fireEvent.change(input, { target: { value: "" } });
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  expect(input).toHaveValue("");
  expect(input.closest(".site")).not.toHaveClass("site--engaged");
});
test("expiry, verification error, and clearing a question require a new token", async () => {
  const f = fixture();
  render(<App backend={f.backend} />);
  const input = screen.getByRole("textbox", { name: "Ask about Tom" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "Question" } });
  act(() => mockTurnstileHandlers.onSuccess("test-token"));
  // Hidden widget stays mounted so its real expiry callback remains live.
  act(() => mockTurnstileHandlers.onExpire());
  expect(screen.getByRole("button", { name: "Send question" })).toBeDisabled();
  act(() => mockTurnstileHandlers.onError());
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Verification could not finish",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Try verification again" }),
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  act(() => mockTurnstileHandlers.onSuccess("test-token"));
  fireEvent.change(input, { target: { value: "" } });
  fireEvent.change(input, { target: { value: "New question" } });
  expect(screen.getByRole("button", { name: "Send question" })).toBeDisabled();
  await waitFor(() => expect(f.backend.getHints).toHaveBeenCalled());
});
test("retired history links return to the landing page without a saved-answer UI", async () => {
  window.history.replaceState({}, "", "/history/saved");
  const f = fixture();
  render(<App backend={f.backend} />);
  await waitFor(() => expect(f.backend.getHints).toHaveBeenCalled());
  expect(window.location.pathname).toBe("/");
  expect(screen.getByRole("textbox", { name: "Ask about Tom" })).toHaveValue(
    "",
  );
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  expect(
    screen.queryByText(/saved conversation|report abuse|salieri/i),
  ).not.toBeInTheDocument();
});
test("system reduced motion does not change the manual pause control", async () => {
  (window.matchMedia as jest.Mock).mockReturnValue({
    matches: true,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  });
  const f = fixture();
  render(<App backend={f.backend} />);
  const pause = screen.getByRole("button", {
    name: "Pause landscape animation",
  });
  expect(pause).toBeEnabled();
  expect(window.matchMedia).not.toHaveBeenCalledWith(
    "(prefers-reduced-motion: reduce)",
  );
  fireEvent.click(pause);
  const resume = screen.getByRole("button", {
    name: "Resume landscape animation",
  });
  expect(resume).toBeEnabled();
  fireEvent.click(resume);
  expect(
    screen.getByRole("button", { name: "Pause landscape animation" }),
  ).toHaveAttribute("aria-pressed", "false");
  await waitFor(() => expect(f.backend.getHints).toHaveBeenCalled());
});

test("retrying unavailable suggestions preserves the current draft", async () => {
  const f = fixture();
  (f.backend.getHints as jest.Mock).mockRejectedValueOnce(new Error("Offline"));
  render(<App backend={f.backend} />);
  const input = screen.getByRole("textbox", { name: "Ask about Tom" });
  fireEvent.focus(input);
  await screen.findByText(/Suggestions are unavailable/);
  fireEvent.change(input, { target: { value: "Keep my question" } });
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() =>
    expect(
      screen.queryByText(/Suggestions are unavailable/),
    ).not.toBeInTheDocument(),
  );
  expect(input).toHaveValue("Keep my question");
});

test("blank prompt has no placeholder; text activates dimming and only interactive verification becomes visible", async () => {
  const f = fixture();
  const { container } = render(<App backend={f.backend} />);
  const input = screen.getByRole("textbox", { name: "Ask about Tom" });
  expect(input).not.toHaveAttribute("placeholder");
  fireEvent.focus(input);
  expect(container.querySelector(".site")).not.toHaveClass("site--engaged");
  expect(
    screen.queryByTestId("verification-challenge"),
  ).not.toBeInTheDocument();
  fireEvent.change(input, { target: { value: "Hello" } });
  expect(container.querySelector(".site")).toHaveClass("site--engaged");
  const widget = screen.getByTestId("verification-challenge").parentElement!;
  expect(widget).toHaveAttribute("aria-hidden", "true");
  act(() => mockTurnstileHandlers.onBeforeInteractive());
  expect(widget).toHaveAttribute("aria-hidden", "false");
  expect(widget.parentElement).toHaveClass("verification--interactive");
  act(() => mockTurnstileHandlers.onAfterInteractive());
  expect(widget).toHaveAttribute("aria-hidden", "true");
  act(() => mockTurnstileHandlers.onSuccess("token"));
  expect(screen.getByRole("button", { name: "Send question" })).toBeEnabled();
  fireEvent.change(input, { target: { value: " " } });
  expect(
    screen.queryByTestId("verification-challenge"),
  ).not.toBeInTheDocument();
  expect(container.querySelector(".site")).not.toHaveClass("site--engaged");
  await waitFor(() => expect(f.backend.getHints).toHaveBeenCalled());
});

test("editing during streaming removes the answer and ignores its late updates", async () => {
  const f = fixture();
  render(<App backend={f.backend} />);
  const input = screen.getByRole("textbox", { name: "Ask about Tom" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "Original" } });
  act(() => mockTurnstileHandlers.onSuccess("token"));
  fireEvent.keyDown(input, { key: "Enter" });
  expect(screen.queryByText(/Thinking/)).not.toBeInTheDocument();
  expect(document.querySelectorAll(".loading-dots span")).toHaveLength(3);
  act(() => f.emit({ type: "delta", delta: "Partial answer" }));
  expect(document.querySelector(".loading-dots")).toBeNull();
  fireEvent.change(input, { target: { value: "Edited question" } });
  act(() => {
    f.emit({ type: "delta", delta: "Stale text" });
    f.emit({ type: "stop", stop_reason: "finish" });
  });
  expect(input).toHaveValue("Edited question");
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  expect(document.title).toBe("Tom Shen");
  fireEvent.change(input, { target: { value: "" } });
  expect(input.closest(".site")).not.toHaveClass("site--engaged");
  fireEvent.blur(input);
  fireEvent.focus(input);
  await waitFor(() => expect(f.backend.getHints).toHaveBeenCalled());
});

test("pause is temporary, ignores old saved preferences, and resets on a new mount", async () => {
  localStorage.setItem("landscape-paused", "true");
  const read = jest.spyOn(Storage.prototype, "getItem");
  const write = jest.spyOn(Storage.prototype, "setItem");
  const f = fixture();
  const first = render(<App backend={f.backend} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Pause landscape animation" }),
  );
  expect(
    screen.getByRole("button", { name: "Resume landscape animation" }),
  ).toHaveAttribute("aria-pressed", "true");
  first.unmount();
  render(<App backend={f.backend} />);
  expect(
    screen.getByRole("button", { name: "Pause landscape animation" }),
  ).toHaveAttribute("aria-pressed", "false");
  expect(read).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
  read.mockRestore();
  write.mockRestore();
  await waitFor(() => expect(f.backend.getHints).toHaveBeenCalled());
});

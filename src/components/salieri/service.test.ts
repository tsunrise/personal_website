import { act, renderHook, waitFor } from "@testing-library/react";
import {
  Hints,
  SalieriAPIBackend,
  SalieriBackend,
  StreamItem,
  useSalieri,
} from "./service";
const hints: Hints = {
  welcome: "Hello",
  suggested_questions: ["What does Tom enjoy?"],
  announcement: null,
};
class FakeSocket {
  static current: FakeSocket;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  send = jest.fn();
  close = jest.fn();
  constructor(public url: URL) {
    FakeSocket.current = this;
  }
  emit(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
}
describe("remote API contract", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    global.WebSocket = FakeSocket as unknown as typeof WebSocket;
    global.fetch = jest.fn();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  test("preserves the hints endpoint and cancellation signal", async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => hints,
    });
    const controller = new AbortController();
    expect(await SalieriAPIBackend.getHints(controller.signal)).toEqual(hints);
    expect((fetch as jest.Mock).mock.calls[0][0].pathname).toBe(
      "/api/salieri/hint",
    );
    expect((fetch as jest.Mock).mock.calls[0][1]).toEqual({
      cache: "no-store",
      signal: controller.signal,
    });
  });
  test("rejects malformed hints", async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    await expect(SalieriAPIBackend.getHints()).rejects.toThrow();
  });
  test("preserves websocket payload and streamed events through post-finish metadata", () => {
    const update = jest.fn(),
      error = jest.fn();
    SalieriAPIBackend.subscribeToAnswer("hello", "test-token", update, error);
    const ws = FakeSocket.current;
    ws.onopen?.();
    expect(ws.url.toString()).toBe("wss://tomshen.io/api/salieri/chat");
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ question: "hello", captcha_token: "test-token" }),
    );
    ws.emit({ start: true });
    ws.emit({ delta: "Hello " });
    ws.emit({ delta: "there" });
    ws.emit({ finish: "stop" });
    expect(ws.close).not.toHaveBeenCalled();
    ws.emit({ id: "saved" });
    expect(update.mock.calls.map((c) => c[0])).toEqual([
      { type: "delta", delta: "Hello " },
      { type: "delta", delta: "there" },
      { type: "stop", stop_reason: "finish" },
    ]);
    expect(error).not.toHaveBeenCalled();
    expect(ws.close).toHaveBeenCalledTimes(1);
  });
  test.each(["stop", "finish", "length", "content_filter", "unavailable"])(
    "accepts the %s finish reason",
    (reason) => {
      const update = jest.fn(),
        error = jest.fn();
      const dispose = SalieriAPIBackend.subscribeToAnswer(
        "q",
        "t",
        update,
        error,
      );
      FakeSocket.current.emit({ finish: reason });
      expect(update).toHaveBeenCalledWith({
        type: "stop",
        stop_reason: reason === "stop" ? "finish" : reason,
      });
      FakeSocket.current.onclose?.();
      expect(error).not.toHaveBeenCalled();
      dispose();
    },
  );
  test.each([
    "invalid JSON",
    "unknown event",
    "early close",
    "socket error",
    "timeout",
  ])("reports %s once and releases the socket", (scenario) => {
    const error = jest.fn();
    SalieriAPIBackend.subscribeToAnswer("q", "t", jest.fn(), error);
    const ws = FakeSocket.current;
    if (scenario === "invalid JSON") ws.onmessage?.({ data: "not-json" });
    if (scenario === "unknown event") ws.emit({ hello: "wrong" });
    if (scenario === "early close") ws.onclose?.();
    if (scenario === "socket error") ws.onerror?.();
    if (scenario === "timeout") jest.advanceTimersByTime(45001);
    ws.onerror?.();
    expect(error).toHaveBeenCalledTimes(1);
    expect(ws.close).toHaveBeenCalledTimes(1);
  });
  test("cancellation detaches callbacks and never reports an error", () => {
    const update = jest.fn(),
      error = jest.fn();
    const cancel = SalieriAPIBackend.subscribeToAnswer("q", "t", update, error);
    cancel();
    FakeSocket.current.emit({ delta: "late" });
    jest.runAllTimers();
    expect(update).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(FakeSocket.current.onmessage).toBeNull();
  });
});
function backendFixture() {
  let update: (item: StreamItem) => void = () => {};
  const stop = jest.fn();
  const backend: SalieriBackend = {
    getHints: jest.fn(async () => hints),
    subscribeToAnswer: jest.fn((q, t, onUpdate) => {
      update = onUpdate;
      return stop;
    }),
  };
  return { backend, stop, emit: (item: StreamItem) => update(item) };
}
describe("chat state and navigation", () => {
  beforeEach(() => window.history.replaceState({}, "", "/"));
  test("blocks invalid and duplicate submissions, and ignores old updates after reset", async () => {
    const fixture = backendFixture();
    const { result } = renderHook(() => useSalieri(fixture.backend, () => {}));
    await waitFor(() => expect(result.current.state).toBe("hint_ready"));
    act(() => {
      result.current.ask(" ", "token");
      result.current.ask("x".repeat(301), "token");
      result.current.ask("hello", "");
    });
    expect(fixture.backend.subscribeToAnswer).not.toHaveBeenCalled();
    act(() => {
      result.current.ask("hello", "token");
      result.current.ask("duplicate", "token");
    });
    expect(fixture.backend.subscribeToAnswer).toHaveBeenCalledTimes(1);
    act(() => fixture.emit({ type: "delta", delta: "partial" }));
    expect(result.current.answer).toBe("partial");
    act(() => {
      result.current.reset();
      fixture.emit({ type: "delta", delta: "stale" });
    });
    await waitFor(() => expect(result.current.state).toBe("hint_ready"));
    expect(result.current.answer).toBeNull();
    expect(window.location.pathname).toBe("/");
    expect(fixture.stop).toHaveBeenCalled();
  });
  test.each(["finish", "length", "content_filter", "unavailable"] as const)(
    "handles %s without changing the URL",
    async (reason) => {
      const fixture = backendFixture();
      const { result } = renderHook(() =>
        useSalieri(fixture.backend, () => {}),
      );
      await waitFor(() => expect(result.current.state).toBe("hint_ready"));
      act(() => result.current.ask("Question", "t"));
      act(() => {
        fixture.emit({ type: "stop", stop_reason: reason });
      });
      expect(result.current.state).toBe("done");
      expect(window.location.pathname).toBe("/");
      expect(!!result.current.warning).toBe(reason === "length");
      expect(!!result.current.error).toBe(
        reason === "content_filter" || reason === "unavailable",
      );
    },
  );
  test("legacy links open home and never request a lookup", async () => {
    window.history.replaceState({}, "", "/history/saved");
    const fixture = backendFixture();
    const lookup = jest.fn();
    const backend = { ...fixture.backend, getResponseHistory: lookup };
    const { result } = renderHook(() => useSalieri(backend, () => {}));
    await waitFor(() => expect(result.current.state).toBe("hint_ready"));
    expect(lookup).not.toHaveBeenCalled();
    expect(result.current.answer).toBeNull();
    expect(window.location.pathname).toBe("/");
  });
  test("aborts hint requests and ignores late hints after a question starts", async () => {
    const fixture = backendFixture();
    let resolve: (value: Hints) => void = () => {};
    (fixture.backend.getHints as jest.Mock).mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const { result, unmount } = renderHook(() =>
      useSalieri(fixture.backend, () => {}),
    );
    const signal = (fixture.backend.getHints as jest.Mock).mock.calls[0][0];
    act(() => result.current.ask("Question", "token"));
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(hints));
    expect(result.current.state).toBe("answering");
    act(() => fixture.emit({ type: "delta", delta: "Answer" }));
    expect(result.current.answer).toBe("Answer");
    unmount();
    expect(fixture.stop).toHaveBeenCalled();
  });
  test("clearing an answer cancels its socket without refetching hints", async () => {
    const fixture = backendFixture();
    const { result } = renderHook(() => useSalieri(fixture.backend, () => {}));
    await waitFor(() => expect(result.current.state).toBe("hint_ready"));
    act(() => result.current.ask("Question", "token"));
    act(() => fixture.emit({ type: "delta", delta: "Partial" }));
    act(() => result.current.clearAnswer());
    expect(fixture.stop).toHaveBeenCalledTimes(1);
    act(() => fixture.emit({ type: "delta", delta: "Late" }));
    expect(result.current.answer).toBeNull();
    expect(result.current.question).toBeNull();
    expect(result.current.hints).toEqual(hints);
    expect(fixture.backend.getHints).toHaveBeenCalledTimes(1);
  });
});

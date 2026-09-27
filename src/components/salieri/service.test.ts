import { act, renderHook, waitFor } from "@testing-library/react";
import {
  SalieriAPIBackend,
  SalieriBackend,
  StreamItem,
  useSalieri,
} from "./service";
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
    await waitFor(() => expect(result.current.state).toBe("ready"));
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
    await waitFor(() => expect(result.current.state).toBe("ready"));
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
      await waitFor(() => expect(result.current.state).toBe("ready"));
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
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(lookup).not.toHaveBeenCalled();
    expect(result.current.answer).toBeNull();
    expect(window.location.pathname).toBe("/");
  });
  test("unmounting cancels the active socket", () => {
    const fixture = backendFixture();
    const { result, unmount } = renderHook(() =>
      useSalieri(fixture.backend, () => {}),
    );
    act(() => result.current.ask("Question", "token"));
    unmount();
    expect(fixture.stop).toHaveBeenCalledTimes(1);
  });
  test("clearing an answer cancels its socket and returns to ready", async () => {
    const fixture = backendFixture();
    const { result } = renderHook(() => useSalieri(fixture.backend, () => {}));
    await waitFor(() => expect(result.current.state).toBe("ready"));
    act(() => result.current.ask("Question", "token"));
    act(() => fixture.emit({ type: "delta", delta: "Partial" }));
    act(() => result.current.clearAnswer());
    expect(fixture.stop).toHaveBeenCalledTimes(1);
    act(() => fixture.emit({ type: "delta", delta: "Late" }));
    expect(result.current.answer).toBeNull();
    expect(result.current.question).toBeNull();
    expect(result.current.state).toBe("ready");
  });
});

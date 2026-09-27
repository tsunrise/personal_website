import { useCallback, useEffect, useRef, useState } from "react";

export interface Hints {
  welcome: string;
  suggested_questions: string[];
  announcement: string | null;
}
export type StopReason = "finish" | "length" | "content_filter" | "unavailable";
export type StreamItem =
  | { type: "delta"; delta: string }
  | { type: "stop"; stop_reason: StopReason };
export interface SalieriBackend {
  getHints(signal?: AbortSignal): Promise<Hints>;
  subscribeToAnswer(
    question: string,
    token: string,
    onUpdate: (item: StreamItem) => void,
    onError: (e: Error) => void,
  ): () => void;
}
const base =
  process.env.REACT_APP_SALIERI_API_ENDPOINT ||
  "https://tomshen.io/api/salieri";
function endpoint(path: string) {
  const url = new URL(base);
  url.pathname = url.pathname.replace(/\/$/, "") + "/" + path;
  if (path === "chat")
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url;
}
async function getJSON(url: URL, signal?: AbortSignal) {
  const response = await fetch(url, { cache: "no-store", signal });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "The service is unavailable. Please try again.",
    );
  return data;
}
export const SalieriAPIBackend: SalieriBackend = {
  async getHints(signal) {
    const data = await getJSON(endpoint("hint"), signal);
    if (
      typeof data?.welcome !== "string" ||
      !Array.isArray(data.suggested_questions) ||
      !data.suggested_questions.every((q: unknown) => typeof q === "string")
    ) {
      throw new Error("Unable to read the suggested questions.");
    }
    return {
      ...data,
      announcement:
        typeof data.announcement === "string" ? data.announcement : null,
    };
  },
  subscribeToAnswer(question, token, onUpdate, onError) {
    const ws = new WebSocket(endpoint("chat"));
    let stopped = false;
    let disposed = false;
    let timeout: ReturnType<typeof setTimeout>;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      clearTimeout(timeout);
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      ws.close();
    };
    const fail = (message: string) => {
      if (disposed) return;
      dispose();
      onError(new Error(message));
    };
    const armTimeout = () => {
      clearTimeout(timeout);
      timeout = setTimeout(
        () =>
          stopped
            ? dispose()
            : fail("The connection timed out. Please try again."),
        stopped ? 10000 : 45000,
      );
    };
    armTimeout();
    ws.onopen = () =>
      ws.send(JSON.stringify({ question, captcha_token: token }));
    ws.onmessage = (event) => {
      if (disposed) return;
      try {
        const item = JSON.parse(event.data);
        if (!item || typeof item !== "object") throw new Error();
        if (typeof item.error === "string") {
          fail(item.error);
          return;
        }
        if (stopped && typeof item.id === "string" && item.id) {
          // Let the backend finish recording, then discard its legacy history ID.
          dispose();
          return;
        }
        if (stopped) throw new Error();
        if ("start" in item) {
          armTimeout();
          return;
        }
        if (typeof item.delta === "string")
          onUpdate({ type: "delta", delta: item.delta });
        else if (
          [
            "stop",
            "finish",
            "length",
            "content_filter",
            "unavailable",
          ].includes(item.finish)
        ) {
          stopped = true;
          // The wire protocol uses "stop" for successful completion.
          onUpdate({
            type: "stop",
            stop_reason: item.finish === "stop" ? "finish" : item.finish,
          });
        } else throw new Error();
        armTimeout();
      } catch {
        fail(
          "An unexpected response interrupted the answer. Please try again.",
        );
      }
    };
    ws.onerror = () => fail("Unable to connect. Please try again.");
    ws.onclose = () =>
      stopped
        ? dispose()
        : fail(
            "The connection closed before the answer finished. Please try again.",
          );
    return dispose;
  },
};

type Status =
  | "initializing"
  | "hint_ready"
  | "answering"
  | "done"
  | "error_loading_answer"
  | "error_loading_hints";
interface Snapshot {
  state: Status;
  hints: Hints | null;
  question: string | null;
  answer: string | null;
  error: string | null;
  warning: string | null;
}
const initial: Snapshot = {
  state: "initializing",
  hints: null,
  question: null,
  answer: null,
  error: null,
  warning: null,
};
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please try again.";

export function useSalieri(backend: SalieriBackend, onReset: () => void) {
  const [snapshot, setSnapshot] = useState<Snapshot>(initial);
  const revision = useRef(0);
  const request = useRef<AbortController>();
  const unsubscribe = useRef<() => void>();
  const busy = useRef(false);
  const resetCallback = useRef(onReset);
  resetCallback.current = onReset;
  const cancel = useCallback(() => {
    revision.current += 1;
    request.current?.abort();
    unsubscribe.current?.();
    unsubscribe.current = undefined;
    busy.current = false;
    return revision.current;
  }, []);

  const load = useCallback(() => {
    const version = cancel();
    resetCallback.current();
    const controller = new AbortController();
    request.current = controller;
    setSnapshot(initial);
    document.title = "Tom Shen";
    backend
      .getHints(controller.signal)
      .then((hints) => {
        if (version !== revision.current) return;
        setSnapshot((s) => ({ ...s, hints, state: "hint_ready" }));
      })
      .catch((e) => {
        if (version !== revision.current) return;
        setSnapshot((s) => ({
          ...s,
          state: "error_loading_hints",
          error: message(e),
        }));
      });
  }, [backend, cancel]);
  useEffect(() => {
    // Retired answer links now open the landing page without requesting history.
    if (window.location.pathname.startsWith("/history/")) {
      window.history.replaceState({}, "", "/");
    }
    load();
    return () => {
      cancel();
    };
  }, [load, cancel]);
  const reset = load;
  const clearAnswer = useCallback(() => {
    cancel();
    document.title = "Tom Shen";
    setSnapshot((s) => ({
      ...initial,
      hints: s.hints,
      state: s.hints ? "hint_ready" : "error_loading_hints",
    }));
  }, [cancel]);
  const retryHints = useCallback(() => {
    const version = cancel();
    const controller = new AbortController();
    request.current = controller;
    setSnapshot((s) => ({ ...s, state: "initializing", error: null }));
    backend
      .getHints(controller.signal)
      .then((hints) => {
        if (version === revision.current)
          setSnapshot((s) => ({ ...s, state: "hint_ready", hints }));
      })
      .catch((e) => {
        if (version === revision.current)
          setSnapshot((s) => ({
            ...s,
            state: "error_loading_hints",
            error: message(e),
          }));
      });
  }, [backend, cancel]);
  const ask = useCallback(
    (question: string, token: string) => {
      const trimmed = question.trim();
      if (busy.current || !trimmed || question.length > 300 || !token) return;
      const version = cancel();
      busy.current = true;
      setSnapshot((s) => ({
        ...s,
        state: "answering",
        question: trimmed,
        answer: "",
        error: null,
        warning: null,
      }));
      document.title = "Tom Shen — " + trimmed;
      try {
        unsubscribe.current = backend.subscribeToAnswer(
          trimmed,
          token,
          (item) => {
            if (version !== revision.current) return;
            if (item.type === "delta")
              setSnapshot((s) => ({
                ...s,
                answer: (s.answer || "") + item.delta,
              }));
            else if (item.type === "stop") {
              busy.current = false;
              const warning =
                item.stop_reason === "length"
                  ? "This answer reached its length limit."
                  : null;
              const error =
                item.stop_reason === "content_filter"
                  ? "This question cannot be answered."
                  : item.stop_reason === "unavailable"
                    ? "The service is temporarily unavailable. Please try again."
                    : null;
              setSnapshot((s) => ({ ...s, state: "done", warning, error }));
            }
          },
          (e) => {
            if (version !== revision.current) return;
            busy.current = false;
            setSnapshot((s) => ({
              ...s,
              state: "error_loading_answer",
              error: message(e),
            }));
          },
        );
      } catch (e) {
        busy.current = false;
        setSnapshot((s) => ({
          ...s,
          state: "error_loading_answer",
          error: message(e),
        }));
      }
    },
    [backend, cancel],
  );
  return { ...snapshot, ask, reset, clearAnswer, retryHints };
}

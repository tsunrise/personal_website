import { useEffect, useRef, useState } from "react";
import { Turnstile, TurnstileInstance } from "@marsidev/react-turnstile";
import { Hints } from "./service";

export const MAX_QUESTION_LENGTH = 300;
export default function Composer({
  draft,
  setDraft,
  hints,
  ask,
  hintError = false,
  retryHints,
  submitted = false,
  onActivate,
}: {
  submitted?: boolean;
  onActivate: () => void;
  draft: string;
  setDraft: (s: string) => void;
  hints: Hints | null;
  ask: (question: string, token: string) => void;
  hintError?: boolean;
  retryHints: () => void;
}) {
  const [active, setActive] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [captchaError, setCaptchaError] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const captcha = useRef<TurnstileInstance>();
  const input = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const submitting = useRef(false);
  const populated = !!draft.trim(),
    tooLong = draft.length > MAX_QUESTION_LENGTH;
  const ready = populated && !tooLong && !!token && !submitted;
  useEffect(() => {
    if (!populated || submitted) {
      setToken(null);
      setInteractive(false);
      setCaptchaError(false);
    }
    if (!submitted) submitting.current = false;
  }, [populated, submitted]);
  useEffect(() => {
    const resize = () => {
      if (!input.current) return;
      input.current.style.height = "0px";
      input.current.style.height =
        Math.max(30, input.current.scrollHeight) + "px";
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draft, submitted]);
  useEffect(() => {
    if (!active || !window.visualViewport) return;
    let frame = 0;
    const keepInputVisible = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        input.current?.scrollIntoView({ block: "nearest" }),
      );
    };
    window.visualViewport.addEventListener("resize", keepInputVisible);
    return () => {
      cancelAnimationFrame(frame);
      window.visualViewport?.removeEventListener("resize", keepInputVisible);
    };
  }, [active]);
  const submit = () => {
    if (!ready || !token || submitting.current) return;
    submitting.current = true;
    ask(draft, token);
    setToken(null);
  };
  return (
    <section
      className={`composer ${active ? "composer--active" : ""}`}
      aria-label="Ask a question about Tom"
      onFocus={(e) => {
        setActive(true);
        if (!e.currentTarget.contains(e.relatedTarget as Node)) onActivate();
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node) && !draft)
          setActive(false);
      }}
    >
      <form
        className="question-line"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <span className="question-line__prompt" aria-hidden="true">
          &gt;
        </span>
        <textarea
          ref={input}
          aria-label="Ask about Tom"
          aria-describedby={active && !submitted ? "question-help" : undefined}
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
          }}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !composing.current &&
              !e.nativeEvent.isComposing &&
              e.keyCode !== 229
            ) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {populated && !submitted && (
          <button
            className="send"
            type="submit"
            aria-label="Send question"
            disabled={!ready}
          >
            ↗
          </button>
        )}
      </form>
      {active && !submitted && (
        <div className="composer__details">
          {hintError && (
            <p className="connection-note">
              Suggestions are unavailable. You can still ask a question.{" "}
              <button type="button" onClick={retryHints}>
                Retry
              </button>
            </p>
          )}
          <p id="question-help" className="question-help sr-only">
            Enter to send. Shift + Enter for a new line.
          </p>
          {!populated && hints?.suggested_questions.length ? (
            <div className="suggestions" aria-label="Suggested questions">
              {hints.suggested_questions.slice(0, 3).map((q) => (
                <button
                  type="button"
                  key={q}
                  onClick={() => {
                    setDraft(q);
                    input.current?.focus();
                  }}
                >
                  {q} <span aria-hidden="true">↗</span>
                </button>
              ))}
            </div>
          ) : null}
          {hints?.announcement && (
            <p className="notice">{hints.announcement}</p>
          )}
          {draft.length > 240 && (
            <p
              className={tooLong ? "notice notice--error" : "character-count"}
              role={tooLong ? "alert" : undefined}
            >
              {draft.length} / {MAX_QUESTION_LENGTH}
              {tooLong ? " — Please shorten your question." : ""}
            </p>
          )}
          {populated && (
            <div
              className={`verification ${interactive && !token ? "verification--interactive" : ""}`}
            >
              <div
                className="verification__widget"
                aria-hidden={!interactive || !!token}
              >
                <Turnstile
                  ref={captcha}
                  siteKey="0x4AAAAAAADKETLTiaTObZqk"
                  options={{
                    theme: "light",
                    size: "flexible",
                    appearance: "interaction-only",
                  }}
                  onBeforeInteractive={() => setInteractive(true)}
                  onAfterInteractive={() => setInteractive(false)}
                  onTimeout={() => {
                    setToken(null);
                    setInteractive(false);
                    setCaptchaError(true);
                  }}
                  onUnsupported={() => {
                    setToken(null);
                    setInteractive(false);
                    setCaptchaError(true);
                  }}
                  onSuccess={(value) => {
                    setInteractive(false);
                    setToken(value);
                    setCaptchaError(false);
                  }}
                  onError={() => {
                    setInteractive(false);
                    setToken(null);
                    setCaptchaError(true);
                  }}
                  onExpire={() => {
                    setInteractive(false);
                    setToken(null);
                    setCaptchaError(false);
                    captcha.current?.reset();
                  }}
                />
              </div>
              {captchaError && (
                <p className="notice notice--error" role="alert">
                  Verification could not finish.{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setCaptchaError(false);
                      setInteractive(false);
                      captcha.current?.reset();
                    }}
                  >
                    Try verification again
                  </button>
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

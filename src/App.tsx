import { lazy, Suspense, useCallback, useState } from "react";
import Dialog from "./components/Dialog";
import { PrivacyDialog } from "./components/privacy";
import Composer from "./components/salieri/Composer";
import {
  SalieriAPIBackend,
  SalieriBackend,
  useSalieri,
} from "./components/salieri/service";
import wechatQRCode from "./images/qr-code.svg";
const Landscape = lazy(() => import("./components/landscape/Landscape"));

function useMotion() {
  const [paused, setPaused] = useState(false);
  const toggle = () => setPaused((p) => !p);
  return { motion: !paused, toggle };
}
export default function App({
  backend = SalieriAPIBackend,
}: {
  backend?: SalieriBackend;
}) {
  const [draft, setDraft] = useState("");
  const [cleared, setCleared] = useState(false);
  const [dialog, setDialog] = useState<"wechat" | "privacy" | null>(null);
  const resetUI = useCallback(() => {
    setDraft("");
    setCleared(false);
  }, []);
  const service = useSalieri(backend, resetUI);
  const { motion, toggle } = useMotion();
  const reading = service.question !== null;
  const answering = service.state === "answering";
  const changeDraft = (value: string) => {
    if (reading) service.clearAnswer();
    setDraft(value);
    setCleared(!value.trim());
  };
  const returnHome = () => {
    service.reset();
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  };
  return (
    <div
      className={`site ${reading || draft.trim() ? "site--engaged" : ""} ${cleared ? "site--cleared" : ""}`}
    >
      <Suspense
        fallback={
          <div className="landscape landscape--loading" aria-hidden="true" />
        }
      >
        <Landscape motion={motion} />
      </Suspense>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <main id="main" className="main">
        <div className="identity">
          <h1>
            {reading ? (
              <button type="button" onClick={() => returnHome()}>
                Tom Shen
              </button>
            ) : (
              "Tom Shen"
            )}
          </h1>
        </div>
        <div className="content">
          <nav className="social-links" aria-label="Find Tom elsewhere">
            <a
              href="https://github.com/tsunrise"
              target="_blank"
              rel="noreferrer"
            >
              <span className="leader" aria-hidden="true" />
              <span>github</span>
            </a>
            <a
              href="https://www.linkedin.com/in/conghao-shen/"
              target="_blank"
              rel="noreferrer"
            >
              <span className="leader" aria-hidden="true" />
              <span>linkedin</span>
            </a>
            <button
              type="button"
              onClick={() => setDialog("wechat")}
              aria-haspopup="dialog"
            >
              <span className="leader" aria-hidden="true" />
              <span>wechat</span>
            </button>
          </nav>
          <Composer
            draft={draft}
            submitted={reading}
            setDraft={changeDraft}
            onActivate={() => setCleared(false)}
            hints={service.hints}
            ask={service.ask}
            hintError={service.state === "error_loading_hints"}
            retryHints={service.retryHints}
          />
          {reading && (
            <article className="conversation" aria-label="Answer">
              {service.answer !== null && (
                <div
                  className={`answer ${answering ? "answer--streaming" : ""}`}
                  aria-busy={answering}
                >
                  {service.answer}
                </div>
              )}
              <p className="sr-only" role="status">
                {answering
                  ? "Answering."
                  : service.error
                    ? "The answer could not be completed."
                    : "Answer complete."}
              </p>
              {answering && !service.answer && (
                <p className="loading-dots" aria-hidden="true">
                  <span>.</span>
                  <span>.</span>
                  <span>.</span>
                </p>
              )}
              {service.warning && (
                <p className="notice" role="status">
                  {service.warning}
                </p>
              )}
              {service.error && (
                <p className="notice notice--error" role="alert">
                  {service.error}
                </p>
              )}
            </article>
          )}
        </div>
      </main>
      <footer className="site-footer">
        <button
          className="motion-control"
          type="button"
          onClick={toggle}
          aria-label={
            motion ? "Pause landscape animation" : "Resume landscape animation"
          }
          aria-pressed={!motion}
        >
          <span
            className={
              motion ? "motion-symbol" : "motion-symbol motion-symbol--paused"
            }
            aria-hidden="true"
          >
            {motion ? "Ⅱ" : "▷"}
          </span>
          <span>{motion ? "pause" : "resume"}</span>
        </button>
        <div className="footer-links">
          <span>© Conghao Shen</span>
          <span aria-hidden="true">/</span>
          <button type="button" onClick={() => setDialog("privacy")}>
            Privacy
          </button>
          <span aria-hidden="true">/</span>
          <a
            href="https://github.com/tsunrise/personal_website"
            target="_blank"
            rel="noreferrer"
          >
            Source
          </a>
        </div>
      </footer>
      {dialog === "wechat" && (
        <Dialog title="Find me on WeChat" onClose={() => setDialog(null)}>
          <img
            className="wechat-qr"
            src={wechatQRCode}
            alt="Tom Shen’s WeChat QR code"
          />
          <p className="dialog__caption">Scan with WeChat to say hello.</p>
        </Dialog>
      )}
      {dialog === "privacy" && (
        <PrivacyDialog onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

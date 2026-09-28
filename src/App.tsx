import { lazy, Suspense, useCallback, useState } from "react";
import Dialog from "./components/Dialog";
import Composer from "./components/salieri/Composer";
import {
  SalieriAPIBackend,
  SalieriBackend,
  useSalieri,
} from "./components/salieri/service";
import wechatQRCode from "./images/qr-code.svg";
const Landscape = lazy(() => import("./components/landscape/Landscape"));

export default function App({
  backend = SalieriAPIBackend,
}: {
  backend?: SalieriBackend;
}) {
  const [draft, setDraft] = useState("");
  const [dialog, setDialog] = useState<"wechat" | null>(null);
  const [tsukuyomi, setTsukuyomi] = useState(false);
  const resetUI = useCallback(() => {
    setDraft("");
  }, []);
  const service = useSalieri(backend, resetUI);
  const reading = service.question !== null;
  const answering = service.state === "answering";
  const changeDraft = (value: string) => {
    if (reading) service.clearAnswer();
    setDraft(value);
  };
  const returnHome = () => {
    service.reset();
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  };
  return (
    <div
      className={`site ${tsukuyomi ? "site--tsukuyomi" : reading || draft.trim() ? "site--engaged" : ""}`}
    >
      <Suspense
        fallback={
          <div className="landscape landscape--loading" aria-hidden="true" />
        }
      >
        <Landscape />
      </Suspense>
      <button
        className="tsukuyomi-toggle"
        type="button"
        aria-label="月読 — Tsukuyomi mode"
        aria-pressed={tsukuyomi}
        onClick={() => {
          setDialog(null);
          setTsukuyomi((active) => !active);
        }}
      >
        <span lang="ja">月読</span>
      </button>
      <main id="main" className="main" hidden={tsukuyomi}>
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
            ask={service.ask}
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
      <footer className="site-footer" hidden={tsukuyomi}>
        <div className="footer-links">
          <span>© Conghao Shen</span>
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
    </div>
  );
}

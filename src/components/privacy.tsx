import { useEffect, useState } from "react";
import Dialog from "./Dialog";
export function PrivacyDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("Loading privacy policy…");
  useEffect(() => {
    const controller = new AbortController();
    fetch(process.env.PUBLIC_URL + "/privacy.txt", {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.text();
      })
      .then(setText)
      .catch(() => {
        if (!controller.signal.aborted)
          setText(
            "The privacy policy could not be loaded. You can open the text version below.",
          );
      });
    return () => controller.abort();
  }, []);
  return (
    <Dialog title="Privacy" onClose={onClose}>
      <p className="privacy-text">{text}</p>
      <a
        href={process.env.PUBLIC_URL + "/privacy.txt"}
        target="_blank"
        rel="noreferrer"
      >
        Open text version ↗
      </a>
    </Dialog>
  );
}

import { Alert, Collapse, LinearProgress, Snackbar } from "@mui/material";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReplayIcon from "@mui/icons-material/Replay";
import LinkIcon from "@mui/icons-material/Link";
import IosShareIcon from "@mui/icons-material/IosShare";
import { Turnstile, TurnstileInstance } from "@marsidev/react-turnstile";
import { SalieriAPIBackend, useSalieri } from "./service";
import "./loading.css";

const cf_turnstile_keys = {
    tomshen_io: "0x4AAAAAAADKETLTiaTObZqk"
};

const MAX_QUESTION_LENGTH = 300;

function SpeakerLabel(props: { speaker: string; tone?: "tom" | "user" }) {
    return <div className={`message__label ${props.tone === "tom" ? "message__label--tom" : ""}`}>{props.speaker}</div>;
}

function Message(props: { speaker: string; text: string; tone?: "tom" | "user" }) {
    return (
        <div className={`message ${props.tone === "tom" ? "message--tom" : "message--user"}`}>
            <SpeakerLabel speaker={props.speaker} tone={props.tone} />
            <p className="message__body">{props.text}</p>
        </div>
    );
}

function RetroAlert(props: { severity: "info" | "warning" | "error"; children: ReactNode }) {
    return (
        <Alert className={`retro-alert retro-alert--${props.severity}`} severity={props.severity}>
            {props.children}
        </Alert>
    );
}

function InputBox(props: {
    question: string;
    setQuestion: (question: string) => void;
    suggested_questions: string[];
    captcha_token: string | null;
    set_captcha_token: (token: string | null) => void;
    submit: () => void;
    disabled?: boolean;
}) {
    const inputIsEmpty = props.question.length === 0;
    const trimmedIsEmpty = props.question.trim().length === 0;
    const lengthRatio = Math.min(props.question.length / MAX_QUESTION_LENGTH, 1);
    const lengthExceeded = props.question.length > MAX_QUESTION_LENGTH;
    const displayProgress = lengthRatio > 0.8 && !lengthExceeded;
    const [captchaError, setCaptchaError] = useState(false);
    const captchaRef = useRef<TurnstileInstance>();
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const askButtonRef = useRef<HTMLButtonElement>(null);
    const askGlowFrameRef = useRef<number | null>(null);
    const askGlowPointRef = useRef({ x: "50%", y: "50%" });

    const getTokens = useCallback(() => {
        return captchaRef.current?.getResponse() || null;
    }, []);

    useEffect(() => {
        if (props.captcha_token === null) {
            captchaRef.current?.reset();
        }
    }, [props.captcha_token]);

    useEffect(() => {
        const input = inputRef.current;
        if (!input) {
            return;
        }
        input.style.height = "0px";
        input.style.height = `${input.scrollHeight}px`;
    }, [props.question]);

    useEffect(() => {
        return () => {
            if (askGlowFrameRef.current !== null) {
                window.cancelAnimationFrame(askGlowFrameRef.current);
            }
        };
    }, []);

    const updateAskGlow = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        askGlowPointRef.current = {
            x: `${event.clientX - rect.left}px`,
            y: `${event.clientY - rect.top}px`
        };

        if (askGlowFrameRef.current !== null) {
            return;
        }

        askGlowFrameRef.current = window.requestAnimationFrame(() => {
            askButtonRef.current?.style.setProperty("--ask-x", askGlowPointRef.current.x);
            askButtonRef.current?.style.setProperty("--ask-y", askGlowPointRef.current.y);
            askGlowFrameRef.current = null;
        });
    }, []);

    return (
        <div className="ask-block">
            <form
                className="ask-form"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (!lengthExceeded && !trimmedIsEmpty && props.captcha_token !== null) {
                        props.submit();
                    }
                }}
            >
                <SpeakerLabel speaker="YOU" tone="user" />
                <textarea
                    ref={inputRef}
                    className="ask-form__input"
                    aria-label="Message Input Box to Salieri"
                    placeholder="Ask anything..."
                    rows={2}
                    maxLength={MAX_QUESTION_LENGTH + 40}
                    value={props.question}
                    disabled={props.disabled}
                    onChange={(event) => props.setQuestion(event.target.value)}
                />
                <button
                    ref={askButtonRef}
                    className="ask-form__button"
                    type="submit"
                    disabled={lengthExceeded || trimmedIsEmpty || props.captcha_token === null || props.disabled}
                    onPointerMove={updateAskGlow}
                >
                    ASK
                </button>
            </form>

            <Collapse in={displayProgress}>
                <LinearProgress className="length-progress" variant="determinate" value={lengthRatio * 100} />
            </Collapse>

            {!inputIsEmpty && (
                <div className="captcha-zone">
                    {lengthExceeded && (
                        <RetroAlert severity="error">
                            Your question is too long. ({props.question.length}/{MAX_QUESTION_LENGTH})
                        </RetroAlert>
                    )}
                    {captchaError && (
                        <RetroAlert severity="error">
                            Salieri can only answer questions from humans, and is unable to verify that you are one.
                        </RetroAlert>
                    )}
                    {props.captcha_token === null && !captchaError && (
                        <div className="turnstile-shell">
                            <Turnstile
                                siteKey={cf_turnstile_keys.tomshen_io}
                                options={{
                                    theme: "dark",
                                    appearance: "always"
                                }}
                                onSuccess={(token) => {
                                    props.set_captcha_token(token || getTokens());
                                    setCaptchaError(false);
                                }}
                                onError={() => {
                                    props.set_captcha_token(null);
                                    setCaptchaError(true);
                                }}
                                onExpire={() => {
                                    props.set_captcha_token(null);
                                    setCaptchaError(false);
                                }}
                                ref={captchaRef}
                            />
                            <button
                                className="text-command"
                                type="button"
                                onClick={() => {
                                    captchaRef.current?.reset();
                                }}
                            >
                                Cannot see the captcha?
                            </button>
                        </div>
                    )}
                    <div className="ask-actions">
                        <button className="secondary-command secondary-command--blue" type="button" onClick={() => props.setQuestion("")}>
                            <ReplayIcon /> START OVER
                        </button>
                        {captchaError && (
                            <button
                                className="secondary-command secondary-command--hot"
                                type="button"
                                onClick={() => {
                                    setCaptchaError(false);
                                    captchaRef.current?.reset();
                                }}
                            >
                                RETRY
                            </button>
                        )}
                    </div>
                </div>
            )}

            {inputIsEmpty && props.suggested_questions.length > 0 && (
                <div className="prompt-grid">
                    {props.suggested_questions.map((question, index) => (
                        <button className="prompt-card" type="button" key={question} onClick={() => props.setQuestion(question)}>
                            <span className="prompt-card__icon">{String(index + 1).padStart(2, "0")}</span>
                            <span>{question}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function ResponseBox(props: { answering: boolean; answer: string }) {
    return (
        <>
            <Message speaker="TOM" text={props.answer} tone="tom" />
            {props.answering && (
                <div className="terminal-loader" aria-label="Salieri is answering">
                    <div className="dot-flashing" />
                </div>
            )}
        </>
    );
}

export const Salieri = () => {
    const [userQuestion, setUserQuestion] = useState("");
    const backend = useMemo(() => SalieriAPIBackend, []);
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);
    const [reportAbuseActive, setReportAbuseActive] = useState(false);

    const resetHandler = useCallback(() => {
        setUserQuestion("");
        setCaptchaToken(null);
        setReportAbuseActive(false);
    }, []);

    const service = useSalieri(backend, resetHandler);
    const suggestedQuestions = service.hints?.suggested_questions ?? [];
    const welcomeText = service.hints?.welcome ?? "";
    const announcement = service.hints?.announcement ?? null;

    const [notifMsg, setNotifMsg] = useState<string | null>(null);
    const [notifOpen, setNotifOpen] = useState(false);
    const [notifSuccessStatus, setNotifSuccessStatus] = useState(false);

    const displayNotif = useCallback((msg: string, success: boolean) => {
        setNotifMsg(msg);
        setNotifSuccessStatus(success);
        setNotifOpen(true);
    }, []);

    const handleCopyLink = useCallback(() => {
        navigator.clipboard.writeText(window.location.href).then(() => {
            displayNotif("Link copied to clipboard", true);
        }).catch(() => {
            displayNotif("Failed to copy link", false);
        });
    }, [displayNotif]);

    const handleShare = useCallback(() => {
        if (navigator.share) {
            navigator.share({
                title: "Salieri System by Tom Shen",
                text: service.question ?? "",
                url: window.location.href
            }).catch((error) => console.log("Error sharing", error));
        } else {
            navigator.clipboard.writeText(window.location.href).then(() => {
                displayNotif("Your browser does not support sharing. Link copied to clipboard", true);
            }).catch(() => {
                displayNotif("Failed to copy link", false);
            });
        }
    }, [service.question, displayNotif]);

    const canShowContent = service.state === "hint_ready" ||
        service.state === "answering" ||
        service.state === "done" ||
        service.state === "done_history" ||
        service.state === "error_loading_answer";

    return (
        <section className="terminal" aria-label="Salieri System">
            <div className="terminal__bar">
                <div className="terminal__brand">
                    <span className="terminal__star" aria-hidden="true">{">_"}</span>
                    <span>SALIERI SYSTEM</span>
                </div>
            </div>

            {service.state === "initializing" && (
                <div className="terminal-loader terminal-loader--initial">
                    <div className="dot-flashing" />
                </div>
            )}

            {canShowContent && (
                <div className="transcript">
                    {service.state === "done_history" && (
                        <>
                            <RetroAlert severity="info">
                                <b>This is a past conversation.</b> The content is unmoderated and could include offensive material. The answer may also be outdated.{" "}
                                <button className="inline-command" type="button" onClick={() => setReportAbuseActive(true)}>
                                    Report Abuse
                                </button>
                            </RetroAlert>
                            {reportAbuseActive && (
                                <RetroAlert severity="info">
                                    <b>Report Abuse: </b>
                                    <a className="inline-link" target="_blank" rel="noreferrer" href="https://forms.gle/QiCrtnxwzMxGLUYd8">via Google Form</a>
                                    <a className="inline-link" target="_blank" rel="noreferrer" href="mailto:dh5ek61f4@mozmail.com">via Email</a>
                                </RetroAlert>
                            )}
                        </>
                    )}

                    {service.state === "hint_ready" && announcement !== null && (
                        <RetroAlert severity="info">{announcement}</RetroAlert>
                    )}

                    <Message speaker="TOM" text={welcomeText} tone="tom" />
                </div>
            )}

            {service.state === "hint_ready" && (
                <InputBox
                    question={userQuestion}
                    setQuestion={setUserQuestion}
                    captcha_token={captchaToken}
                    set_captcha_token={setCaptchaToken}
                    suggested_questions={suggestedQuestions}
                    submit={() => {
                        if (captchaToken !== null) {
                            service.ask(userQuestion, captchaToken);
                        }
                    }}
                    disabled={false}
                />
            )}

            {(service.state === "answering" || service.state === "done" || service.state === "done_history" || service.state === "error_loading_answer") && (
                <div className="transcript transcript--answer">
                    <Message speaker="YOU" text={service.question ?? ""} tone="user" />
                    {service.answer !== null && <ResponseBox answering={service.state === "answering"} answer={service.answer} />}
                </div>
            )}

            {service.warning !== null && <RetroAlert severity="warning">{service.warning}</RetroAlert>}
            {service.error !== null && <RetroAlert severity="error">{service.error}</RetroAlert>}

            {(service.state === "answering" || service.state === "done" || service.state === "done_history" || service.state === "error_loading_answer" || service.state === "error_loading_hints") && (
                <div className="terminal-actions">
                    {navigator.share !== undefined && (
                        <button className="icon-command" type="button" disabled={service.state === "answering"} onClick={handleShare} aria-label="Share">
                            <IosShareIcon />
                        </button>
                    )}
                    <button className="icon-command" type="button" disabled={service.state === "answering"} onClick={handleCopyLink} aria-label="Copy link">
                        <LinkIcon />
                    </button>
                    <button className="secondary-command" type="button" disabled={service.state === "answering"} onClick={() => service.reset()}>
                        <ReplayIcon /> START OVER
                    </button>
                </div>
            )}

            <Snackbar open={notifOpen} autoHideDuration={3000} onClose={() => setNotifOpen(false)}>
                <Alert onClose={() => setNotifOpen(false)} severity={notifSuccessStatus ? "success" : "error"} sx={{ width: "100%" }}>
                    {notifMsg}
                </Alert>
            </Snackbar>
        </section>
    );
};

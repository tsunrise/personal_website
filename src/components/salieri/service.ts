import { stat } from "fs";
import { useCallback, useEffect, useRef, useState } from "react";
import internal from "stream";

interface Hints {
    welcome: string;
    suggested_questions: string[];
    announcement: string | null;
}

interface StreamItemDelta {
    type: 'delta';
    delta: string;
}

interface StreamItemStop {
    type: 'stop';
    stop_reason: 'finish' | 'length' | 'content_filter' | 'unavailable'
}

interface StreamItemMeta {
    type: 'meta';
    id: string;
}

interface LookupHistoryResponse {
    question: string;
    response: string;
    timestamp: number;
}

interface FeedbackEntry {
    feedback?: boolean;
    comment?: string;
}

interface FeedbackUpdateRequest {
    id: string;
    secret: string;
    feedback?: boolean;
    comment?: string;
}

// TODO: put me in useEffect(..., []) instead of the component function to avoid re-creating the service on every render
export interface SalieriBackend {
    getHints(): Promise<Hints>;
    subscribeToAnswer(question: string, token: string, onUpdate: (item: StreamItemDelta | StreamItemStop | StreamItemMeta) => void, onError: (e: Error) => void): void;
    getResponseHistory(id: string): Promise<LookupHistoryResponse>;
    getFeedback(id: string, secret: string): Promise<FeedbackEntry>;
    updateFeedback(req: FeedbackUpdateRequest): Promise<FeedbackEntry>;
}

// dummy service
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export const DummySalieriBackend: SalieriBackend = {
    getHints: async () => {
        await delay(200);
        return {
            welcome: "Hi, I'm Tom's friend Salieri! Whether you're curious about Tom's work, hobbies, or favorites, I'm here to instantly assist you—anytime.",
            suggested_questions: ["What is Tom's hobby?", "What is Tom's favorite color?", "What is Tom's favorite food?"],
            announcement: null,
        };
    },

    subscribeToAnswer: (question, token, onUpdate, onError) => {
        // stream the answer word by word, asynchronously
        const deltas = ["You ", "asked: \"", question, "\" and", " the", " answer", " is:", " 42.", "Your", " token is: \n\n ", token, "."];
        if (question === "hhh") {
            onError(new Error("test."));
            return;
        }
        if (question === "hhh2") {
            onUpdate({ type: 'stop', stop_reason: 'content_filter' });
            onUpdate({ type: 'meta', id: '2022-01-01-test1' + token.substring(0, 10) });
            return;
        }
        if (question === "hhh3") {
            onUpdate({ type: 'stop', stop_reason: 'unavailable' });
            return;
        }
        (async () => {
            for (const word of deltas) {
                await delay(50);
                onUpdate({ type: 'delta', delta: word });
            }
            if (question === "hhh4") {
                onUpdate({ type: 'stop', stop_reason: 'length' });
                return;
            }
            if (question === "hhh5") {
                onError(new Error("test2."));
                return;
            }
            onUpdate({ type: 'stop', stop_reason: 'finish' });
            onUpdate({ type: 'meta', id: '2022-01-01-test2' + token.substring(0, 10) });
        })();
    },

    getResponseHistory: async (id: string) => {
        await delay(1000);
        return {
            question: "What is Tom's hobby?",
            response: "Tom's hobby is programming. id=" + id,
            timestamp: 1234567890,
        };
    },

    getFeedback: async (id: string, secret: string) => {
        await delay(1000);
        return {}
    },

    updateFeedback: async (req: FeedbackUpdateRequest) => {
        await delay(1000);
        return {
            ...req,
        }
    }
}

// real service
const SALIERI_API_ENDPOINT_ENV = process.env.REACT_APP_SALIERI_API_ENDPOINT;
if (!SALIERI_API_ENDPOINT_ENV) {
    throw new Error("REACT_APP_SALIERI_API_ENDPOINT is not set");
}
function createEndpointUrl(pathname: string, protocol: string = "http"): URL {
    const url = new URL(SALIERI_API_ENDPOINT_ENV!);
    url.protocol = url.protocol.replace("http", protocol);
    if (!url.pathname.endsWith("/")) {
        url.pathname += "/";
    }
    url.pathname += pathname;
    return url;
}

const SALIERI_HINT_ENDPOINT = createEndpointUrl("hint");
const SALIERI_CHAT_ENDPOINT = createEndpointUrl("chat", "ws");
const SALIERI_LOOKUP_ENDPOINT = createEndpointUrl("lookup");
const SALIERI_FEEDBACK_ENDPOINT = createEndpointUrl("feedback");


export const SalieriAPIBackend: SalieriBackend = {
    getHints: async () => {
        const response = await fetch(SALIERI_HINT_ENDPOINT);
        if (response.ok) {
            const resp = await response.json();
            if (resp.welcome && resp.suggested_questions) {
                return resp;
            }
            throw new Error("Invalid response: " + JSON.stringify(resp));
        }
        const { error } = await response.json();
        throw new Error(error);
    },

    subscribeToAnswer: (question, token, onUpdate, onError) => {
        const ws = new WebSocket(SALIERI_CHAT_ENDPOINT);
        let ended = false;
        ws.onopen = () => {
            ws.send(JSON.stringify({ question, captcha_token: token }));
        };
        ws.onmessage = (event) => {
            const item = JSON.parse(event.data);
            switch (true) {
                case ended:
                    const meta = item;
                    if (meta.id) {
                        onUpdate({ type: 'meta', id: meta.id });
                    } else {
                        console.error("Unknown message: " + event.data);
                    }
                    break;
                case 'start' in item:
                    // ignore
                    // TODO: handle start message
                    break;
                case 'delta' in item:
                    onUpdate({ type: 'delta', delta: item.delta });
                    break;
                case 'finish' in item:
                    onUpdate({ type: 'stop', stop_reason: item.finish });
                    ended = true;
                    break;
                case 'error' in item:
                    onError(new Error(item.error));
                    ended = true;
                    ws.close();
                    break;
                default:
                    onError(new Error("Unknown message: " + event.data));
                    ws.close();
            }
        };
        ws.onerror = (event) => {
            onError(new Error("WebSocket error: " + event));
        }
        ws.onclose = (event) => {
            console.log("WebSocket closed: " + event.code);
        }

    },

    getResponseHistory: async (id: string) => {
        // const response = await fetch(SALIERI_LOOKUP_ENDPOINT + "?id=" + id);
        const response = await fetch(SALIERI_LOOKUP_ENDPOINT);
        if (response.ok) {
            const resp = await response.json(); // a single lookupHistoryResponse
            if (resp.question && resp.response && resp.timestamp) {
                return resp;
            }
            throw new Error("Invalid response: " + JSON.stringify(resp));
        }
        const { error } = await response.json();
        throw new Error(error);
    },

    getFeedback: async (id: string, secret: string) => {
        const response = await fetch(SALIERI_FEEDBACK_ENDPOINT + "?id=" + id, {
            headers: {
                "Authorization": "Bearer " + secret
            }
        });
        if (response.ok) {
            const resp = await response.json();
            return resp;
        }
        const { error } = await response.json();
        throw new Error(error);
    },

    updateFeedback: async (req: FeedbackUpdateRequest) => {
        const response = await fetch(SALIERI_FEEDBACK_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(req),
        });
        if (response.ok) {
            const resp = await response.json();
            return resp;
        }
        const { error } = await response.json();
        throw new Error(error);
    }


}

type SalieriState = 'initializing' | 'hint_ready' | 'answering' | 'done' | 'done_history' | 'error_loading_answer' | 'error_loading_hints';

// service hook
export const useSalieri = (backend: SalieriBackend, onReset: () => void) => {
    const [state, _setState] = useState<SalieriState>("initializing");
    const stateRef = useRef(state);
    const setState = useCallback((state: SalieriState) => {
        stateRef.current = state;
        _setState(state);
    }, []);

    const [error, setError] = useState<string | null>(null);
    const [warning, setWarning] = useState<string | null>(null);
    const [hints, setHints] = useState<Hints | null>(null);

    const [question, setQuestion] = useState<string | null>(null);
    const [answer, setAnswer] = useState<string | null>(null);
    const [timestamp, setTimestamp] = useState<number | null>(null);

    const [id, setId] = useState<string | null>(null);

    const [secret, setSecret] = useState<string | null>(null); // invariant: is string iff state is `done`
    const [feedback, setFeedback] = useState<boolean | null>(null); // invariant: is boolean iff secret is not null
    const [comment, setComment] = useState<string | null>(null); // invariant: is string iff secret is not null


    const getHints = useCallback(async () => {
        try {
            const hints = await backend.getHints();
            setHints(hints);
            setState("hint_ready");
        } catch (e) {
            let error_message = "Failed to connect to Salieri";
            if (e instanceof Error) {
                error_message += ": " + e.message;
            }
            console.error(error_message);
            setError(error_message);
            setState("error_loading_hints");
        }
    }, [backend, setState])

    // history load: from URL
    useEffect(() => {
        if (window.location.pathname.startsWith("/history/")) {

            const id = window.location.pathname.substring("/history/".length);
            (async () => {
                try {
                    const hints = await backend.getHints();
                    setHints(hints);
                    const { question, response, timestamp } = await backend.getResponseHistory(id);
                    setQuestion(question);
                    updateTitle(question);
                    setAnswer(response);
                    setId(id);
                    setTimestamp(timestamp);
                    setState("done_history");
                } catch (e) {
                    let error_message = "Failed to load history";
                    if (e instanceof Error) {
                        error_message += ": " + e.message;
                    }
                    console.error(error_message);
                    setError(error_message);
                    setState("error_loading_answer");
                }
            })()
        } else {
            getHints();
        }
    }, []);

    // history load: from pop state
    useEffect(() => {
        const onPopState = () => {
            if (window.location.pathname.startsWith("/history/")) {
                const id = window.location.pathname.substring("/history/".length);
                (async () => {
                    try {
                        const { question, response, timestamp } = await backend.getResponseHistory(id);
                        setQuestion(question);
                        updateTitle(question);
                        setAnswer(response);
                        setId(id);
                        setTimestamp(timestamp);
                        setState("done_history");
                    } catch (e) {
                        let error_message = "Failed to load history";
                        if (e instanceof Error) {
                            error_message += ": " + e.message;
                        }
                        console.error(error_message);
                        setError(error_message);
                        setState("error_loading_answer");
                    }
                })()
            } else {
                reset(true);
            }
        };
        window.addEventListener("popstate", onPopState);
        return () => {
            window.removeEventListener("popstate", onPopState);
        }
    }, [backend, setState]);

    const updateTitle = (question: string | null) => {
        if (question !== null) {
            window.document.title = "Tom Shen - " + question;
        } else {
            window.document.title = "Tom Shen";
        }
    };

    const handleError = useCallback((e: Error) => {
        console.error("Salieri error: " + e.message);
        setError("There was an error while answering: " + e.message);
        setState("error_loading_answer");
    }, [setState]);

    const ask = useCallback((question: string, token: string) => {
        if (state === "answering") {
            console.error("Asked while answering. Ignore.");
            return;
        }
        setAnswer("");
        setState("answering");
        setQuestion(question);

        try {
            backend.subscribeToAnswer(question, token, (item) => {
                if (item.type === 'delta') {
                    setAnswer((answer) => answer + item.delta);
                } else if (item.type === 'stop') {
                    setState("done");
                    if (item.stop_reason === 'finish') {
                        console.log("Answering finished");
                    } else if (item.stop_reason === 'length') {
                        setWarning("Salieri stopped answering because the answer has exceeded the maximum length");
                    } else if (item.stop_reason === 'content_filter') {
                        setError("Salieri refused to answer this question due to content filter");
                    } else if (item.stop_reason === 'unavailable') {
                        setError("Salieri is currently unavailable");
                    }
                    // we do not set state to ERROR here because we want to show the answer
                } else {
                    if (stateRef.current !== "done") {
                        console.error(`Received unexpected message type ${item.type} while state is ${state}`);
                    }
                    const id = item.id;
                    setId(id);
                    window.history.pushState({}, "", "/history/" + id);
                    updateTitle(question);
                }
            }, (e) => {
                handleError(e);
            });
        } catch (e) {
            if (e instanceof Error) {
                handleError(e);
            }
        }

    }, [backend, state, handleError, setId, setState])

    const reset = (no_push?: boolean) => {
        onReset();
        setState("initializing");
        setError(null);
        setWarning(null);
        setHints(null);
        setQuestion(null);
        setAnswer(null);
        setId(null);
        if (!no_push) {
            window.history.pushState({}, "", "/");
        }
        updateTitle(null);
        getHints();
    }


    return {
        state,
        error,
        warning,
        hints,
        question,
        answer,
        timestamp,
        ask,
        reset
    };
}

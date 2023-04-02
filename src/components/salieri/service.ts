import { useCallback, useEffect, useState } from "react";

interface Hints {
    welcome: string;
    suggested_questions: string[];
}

interface StreamItemDelta {
    type: 'delta';
    delta: string;
}

interface StreamItemStop {
    type: 'stop';
    stop_reason: 'finish' | 'length' | 'content_filter' | 'unavailable'
}

// TODO: put me in useEffect(..., []) instead of the component function to avoid re-creating the service on every render
export interface SalieriBackend {
    getHints(): Promise<Hints>;
    subscribeToAnswer(question: string, token: string, onUpdate: (item: StreamItemDelta | StreamItemStop) => void, onError: (e: Error) => void): void;
}

// dummy service
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export const DummySalieriBackend: SalieriBackend = {
    getHints: async () => {
        await delay(1000);
        return {
            welcome: "Hi, I'm Tom's friend Salieri! Whether you're curious about Tom's work, hobbies, or favorites, I'm here to instantly assist you—anytime.",
            suggested_questions: ["What is Tom's hobby?", "What is Tom's favorite color?", "What is Tom's favorite food?"]
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
            return;
        }
        if (question === "hhh3") {
            onUpdate({ type: 'stop', stop_reason: 'unavailable' });
            return;
        }
        (async () => {
            for (const word of deltas) {
                await delay(100);
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
        })();
    }
}

// real service
const SALIERI_API_ENDPOINT_ENV = process.env.REACT_APP_SALIERI_API_ENDPOINT;
if (!SALIERI_API_ENDPOINT_ENV) {
    throw new Error("REACT_APP_SALIERI_API_ENDPOINT is not set");
}
const SALIERI_HINT_ENDPOINT = (() => {
    const url = new URL(SALIERI_API_ENDPOINT_ENV);
    url.pathname = "/hint"
    return url
})();
const SALIERI_CHAT_ENDPOINT = (() => {
    const url = new URL(SALIERI_API_ENDPOINT_ENV);
    url.protocol = url.protocol.replace("http", "ws");
    url.pathname = "/chat"
    return url
})();
/**
 * API Examples:
 * GET /hint
OK case:
{"hint":["What is the link to Tom's resume?","What are Tom's GitHub and LinkedIn profiles?","What are Tom's favorite anime?"]}
Error case:
{"error":"Salieri is currently unavailable", "status_code":500}
WS /chat -> {"question":"Hi, Who are you?", "captcha_token":"very secret token"}
OK case:
send: "{"question":"Hi, Who are you?", "captcha_token":"very secret token"}
recv: {"start":128}
recv: {"delta":"Hello"}
recv: {"delta":"!"}
recv: {"delta":" I"}
recv: {"delta":" am"}
recv: {"delta":" Sal"}
recv: {"delta":"ieri"}
recv: {"delta":","}
...
recv: {"finish":"stop"}
Error case:
send: "{"question":"Hi, Who are you?", "captcha_token":"very secret token"}
recv: {"error":"internal error"}
 */
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
        ws.onopen = () => {
            ws.send(JSON.stringify({ question, captcha_token: token }));
        };
        ws.onmessage = (event) => {
            const item = JSON.parse(event.data);
            switch (true) {
                case 'start' in item:
                    // ignore
                    // TODO: handle start message
                    break;
                case 'delta' in item:
                    onUpdate({ type: 'delta', delta: item.delta });
                    break;
                case 'finish' in item:
                    onUpdate({ type: 'stop', stop_reason: item.finish });
                    ws.close();
                    break;
                case 'error' in item:
                    onError(new Error(item.error));
                    ws.close();
                    break;
                default:
                    onError(new Error("Unknown message: " + event.data));
                    ws.close();
            }
        };
        // ws.onerror = (event) => {
        //     onError(new Error("WebSocket error: " + event));
        // }
        ws.onclose = (event) => {
            if (event.code !== 1000) {
                onError(new Error("WebSocket closed: " + event.reason + " (" + event.code + ")"));
            }
        }

    }
}

type SalieriState = 'initializing' | 'hint_ready' | 'answering' | 'done' | 'error_loading_answer' | 'error_loading_hints';

// service hook
export const useSalieri = (backend: SalieriBackend) => {
    const [state, setState] = useState<SalieriState>("initializing");
    const [error, setError] = useState<string | null>(null);
    const [warning, setWarning] = useState<string | null>(null);
    const [hints, setHints] = useState<Hints | null>(null);
    const [answer, setAnswer] = useState<string | null>(null);

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
    }, [backend])

    useEffect(() => {
        getHints();
    }, [getHints]);

    const handleError = useCallback((e: Error) => {
        console.error("Salieri error: " + e.message);
        setError("There was an error while answering: " + e.message);
        setState("error_loading_answer");
    }, []);

    const ask = (question: string, token: string) => {
        if (state === "answering") {
            console.error("Asked while answering. Ignore.");
            return;
        }
        setAnswer("");
        setState("answering");


        try {
            backend.subscribeToAnswer(question, token, (item) => {
                if (item.type === 'delta') {
                    setAnswer((answer) => answer + item.delta);
                } else {
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
                }
            }, (e) => {
                handleError(e);
            });
        } catch (e) {
            if (e instanceof Error) {
                handleError(e);
            }
        }


    }

    const reset = () => {
        setState("initializing");
        setError(null);
        setWarning(null);
        setHints(null);
        setAnswer(null);
        getHints();
    }


    return {
        state,
        error,
        warning,
        hints,
        answer,
        ask,
        reset
    };
}

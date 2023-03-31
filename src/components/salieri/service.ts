import { useCallback, useEffect, useState } from "react";

interface Hints {
    welcome: string;
    suggested_questions: string[];
}

// interface StreamItem {
//     type: 'delta' | 'stop';
//     delta?: string;
//     stop_reason?: 'finish' | 'length' | 'content_filter' | 'unavailable'
// }

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
    subscribeToAnswer(question: string, token: string, onUpdate: (item: StreamItemDelta | StreamItemStop) => void): void;
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

    subscribeToAnswer: (question, token, onUpdate) => {
        // stream the answer word by word, asynchronously
        const deltas = ["You ", "asked: \"", question, "\" and", " the", " answer", " is:", " 42.", "Your", " token is: \n\n ", token, "."];
        if (question === "hhh") {
            throw new Error("test.")
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
            onUpdate({ type: 'stop', stop_reason: 'finish' });
        })();
    }
}

type SalieriState = 'initializing' | 'hint_ready' | 'answering' | 'done' | 'error';

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
            let error_message = "Failed to load hints";
            if (e instanceof Error) {
                error_message += ": " + e.message;
            }
            console.error(error_message);
            setError(error_message);
            setState("error");
        }
    }, [backend])

    useEffect(() => {
        getHints();
    }, [getHints]);

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
            })
        } catch (e) {
            console.error("Error during subscribe: " + e);
            setError("Failed to connect to Salieri: " + e);
            setState("error");
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

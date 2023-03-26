import { useEffect, useState } from "react";

interface Hints {
    welcome: string;
    suggested_questions: string[];
}

interface StreamItem {
    type: 'delta' | 'stop';
    delta?: string;
    stop_reason?: 'finish' | 'length' | 'content_filter' | 'unavailable'
}

// TODO: put me in useEffect(..., []) instead of the component function to avoid re-creating the service on every render
export interface SalieriBackend {
    getHints(): Promise<Hints>;
    subscribeToAnswer(question: string, onUpdate: (item: StreamItem) => void): void;
}

// dummy service
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export const DummySalieriBackend: SalieriBackend = {
    getHints: async () => {
        await delay(1000);
        return {
            welcome: "Hi, I'm Tom's friend Salieri! Whether you're curious about Tom's work, hobbies, or favorites, I'm here to instantly assist you—anytime.",
            suggested_questions: ["What is Tom\'s hobby?", "What is Tom's favorite color?", "What is Tom\'s favorite food?"]
        };
    },

    subscribeToAnswer: (question, onUpdate) => {
        const dummy_answer = "You asked: " + question + " and the answer is: 42";
        // stream the answer word by word, asynchronously
        const words = dummy_answer.split(' ');
        const stream = async () => {
            for (const word of words) {
                await delay(100);
                onUpdate({ type: 'delta', delta: word });
            }
            onUpdate({ type: 'stop', stop_reason: 'finish' });
        }
        stream();
    }
}

// service hook
export const useSalieri = (backend: SalieriBackend) => {
    const [error, setError] = useState<string | null>(null);

    const [hints, setHints] = useState<Hints | null>(null);
    useEffect(() => {
        (async () => {
            try {
                const hints = await backend.getHints();
                setHints(hints);
            } catch (e) {
                let error_message = "Failed to load hints";
                if (e instanceof Error) {
                    error_message += ": " + e.message;
                }
                setError(error_message);
            }
        })();
    });

    const [answer, setAnswer] = useState<string | null>(null);
    const [answering, setAnswering] = useState<boolean>(false);
    const ask = (question: string) => {
        if (answering) {
            console.error("Asked while answering. Ignore.");
            return;
        }
        setAnswering(true);
        setAnswer(null);
        backend.subscribeToAnswer(question, (item) => {
            if (item.type === 'delta') {
                setAnswer((answer) => (answer || '') + item.delta);
            } else if (item.type === 'stop') {
                setAnswering(false);
                if (item.stop_reason === 'finish') {
                    console.log("Answering finished");
                } else if (item.stop_reason === 'length') {
                    setError("Answer is trimmed due to length limit");
                } else if (item.stop_reason === 'content_filter') {
                    setError("Salieri is refusing to answer this question");
                } else if (item.stop_reason === 'unavailable') {
                    setError("Salieri is currently unavailable");
                }
            } else {
                console.error("Unknown stream item type: " + item.type);
            }
        })
    }

    return {
        error,
        hints,
        answer,
        answering,
        ask
    };
}

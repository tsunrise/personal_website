import { Box, TextField, Typography, Button, Collapse, Grow, LinearProgress, Alert } from "@mui/material"
import { blue, grey } from "@mui/material/colors"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import ReplayIcon from '@mui/icons-material/Replay';
import SendIcon from '@mui/icons-material/Send';
import BoltIcon from '@mui/icons-material/Bolt';
import { DummySalieriBackend, useSalieri } from "./service";
import { styled } from "@mui/system";
import { Turnstile, TurnstileInstance } from "@marsidev/react-turnstile";

const cf_turnstile_keys = {
    "always_passes_visible": "1x00000000000000000000AA",
    "always_blocks_visible": "2x00000000000000000000AB",
    "always_passes_invisible": "1x00000000000000000000BB",
    "always_blocks_invisible": "2x00000000000000000000BB",
    "force_interactive_challenge": "3x00000000000000000000FF",
    "tomshen_io": "0x4AAAAAAADKETLTiaTObZqk"
}


const SpeakerTypography = (prop: { speaker: string }) => {
    return <Typography variant="h6" sx={{
        fontWeight: 600,
        textTransform: "uppercase",
        fontSize: 17,
        fontFamily: "Source Sans Pro",
        color: grey[700],
    }}>{prop.speaker}</Typography>
}


const wrap = {
    marginLeft: 2,
    marginRight: 2,
    marginTop: 1,
    marginBottom: 1,
}

const WrapAlert = styled(Alert)(({ theme }) => ({
    marginLeft: theme.spacing(2),
    marginRight: theme.spacing(2),
    marginBottom: theme.spacing(1),
}))

const Message = (prop: { speaker: string, text: string }) => {

    return <Box>
        <SpeakerTypography speaker={prop.speaker} />
        <Typography variant="body1" sx={{
            fontWeight: 400,
            textTransform: "none",
            wordBreak: "break-word",
            ...wrap,
        }}
            whiteSpace="pre-wrap"
        >{prop.text}</Typography>
    </Box>
}

const InputBox = (props: {
    question: string,
    setQuestion: (question: string) => void,
    suggested_questions: string[],
    captcha_token: string | null,
    set_captcha_token: (token: string | null) => void,
    submit: () => void,
    max_length: number,
    disabled?: boolean
}) => {

    const inputIsEmpty = props.question === ""
    const lengthRatio = Math.min(props.question.length / props.max_length, 1)
    const lengthExceeded = props.question.length > props.max_length
    const displayProgress = lengthRatio > 0.8 && !lengthExceeded;

    const [captchaError, setCaptchaError] = useState(false);

    const captcha_ref = useRef<TurnstileInstance>();
    const getTokens = useCallback(() => {
        if (captcha_ref.current) {
            const resp = captcha_ref.current.getResponse();
            if (resp) {
                return resp;
            }
        }
        return null;
    }, [captcha_ref])

    useEffect(() => {
        if (props.captcha_token === null) {
            captcha_ref.current?.reset();
        }
    }, [props.captcha_token])


    return <Box>
        <SpeakerTypography speaker="you" />
        <Box sx={{
            ...wrap,
        }}>
            <TextField
                multiline
                minRows={2}
                maxRows={6}
                sx={{
                    width: "100%",
                }}
                label="Ask anything!"
                variant="outlined"
                value={props.question}
                onChange={(event) => {
                    props.setQuestion(event.target.value)
                }}
                error={props.question.length > props.max_length}
                disabled={props.disabled}
            />
            <Collapse in={displayProgress}>
                <Grow in={displayProgress} timeout={400}>
                    <LinearProgress variant="determinate" value={lengthRatio * 100} sx={{
                        height: 2,
                        display: displayProgress ? "block" : "none",
                        marginTop: 0.5,
                    }} />
                </Grow>
            </Collapse>
        </Box>


        <Collapse in={!inputIsEmpty}>
            {/* Alerts */}
            <Collapse in={lengthExceeded}>
                <Grow in={lengthExceeded} timeout={400}>
                    <WrapAlert severity="error" >
                        Your question is too long. ({props.question.length}/{props.max_length})
                    </WrapAlert>
                </Grow>
            </Collapse>

            <Collapse in={captchaError}>
                <Grow in={captchaError} timeout={400}>

                    <WrapAlert severity="error">
                        Salieri can only answer questions from humans, and is unable to verify that you are one.
                    </WrapAlert>

                </Grow>
            </Collapse>

            {/* Captchas */}
            <Collapse in={(props.captcha_token === null) && (!captchaError)}>
                <Box sx={{
                    ...wrap,
                }}>
                    <Turnstile siteKey={cf_turnstile_keys.tomshen_io}
                        options={{
                            theme: "light",
                            appearance: "always"
                        }}
                        onSuccess={() => { props.set_captcha_token(getTokens()); setCaptchaError(false) }}
                        onError={() => { props.set_captcha_token(null); setCaptchaError(true) }}
                        onExpire={() => { props.set_captcha_token(null); setCaptchaError(false) }}
                        ref={captcha_ref}></Turnstile>
                </Box>
            </Collapse>

            <Box sx={{
                display: "flex",
                justifyContent: "flex-end",
                ...wrap,
            }}>
                <Grow in={!inputIsEmpty} timeout={400}>
                    <Button variant="outlined" startIcon={<ReplayIcon />} color="secondary"
                        onClick={() => {
                            props.setQuestion("")
                        }}
                    >
                        Start Over
                    </Button>
                </Grow>
                <Grow in={(!inputIsEmpty)} timeout={800}>
                    <Button variant="contained" endIcon={<SendIcon />} color="primary" sx={{
                        marginLeft: 1,
                    }}
                        onClick={() => {
                            props.submit()
                        }}
                        disabled={lengthExceeded || props.captcha_token === null}
                    >
                        Send
                    </Button>
                </Grow>
                {captchaError &&
                    <Button variant="contained" endIcon={<BoltIcon />} color="error" sx={{
                        marginLeft: 1,
                    }}
                        onClick={() => {
                            setCaptchaError(false);
                            captcha_ref.current?.reset();
                        }}
                    >
                        retry
                    </Button>
                }
            </Box>
        </Collapse>
        <Collapse in={inputIsEmpty}>
            <Box sx={{
                ...wrap,
            }}>
                {/* Show a list of buttons with 100% width, and each button displays a suggested question. Put text in middle.*/}
                {props.suggested_questions.map((question, index) => {
                    return <Grow key={index} in={inputIsEmpty} timeout={(index + 1) * 400}>
                        <Box sx={{
                            width: "100%",
                            marginBottom: 1,
                        }}>
                            <Button variant="outlined" sx={{
                                width: "100%",
                                textTransform: "none",
                                fontWeight: 400,
                                fontSize: 16,
                                fontFamily: "Source Sans Pro",
                                color: blue[700],
                            }}
                                onClick={() => {
                                    props.setQuestion(question)
                                }}
                            >{question}</Button>
                        </Box>
                    </Grow>

                })}
            </Box>
        </Collapse>
    </Box>
}

const ResponseBox = (props: { answering: boolean, answer: string, warning?: string, onStartOver: () => void }) => {
    return <Box>
        <Message speaker={
            props.answering ? "Salieri is answering" : "Salieri"
        } text={props.answer} />
    </Box>
}




export const Salieri = () => {
    // initialize Salieri Service

    const [userQuestion, setUserQuestion] = useState("")
    const backend = useMemo(() => DummySalieriBackend, [])
    const service = useSalieri(backend)

    // captcha
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);

    const suggested_questions = (service.hints == null) ? [] : service.hints.suggested_questions
    const welcome_text = (service.hints == null) ? "Salieri is Loading..." : service.hints.welcome

    const reset = useCallback(() => {
        setUserQuestion("");
        setCaptchaToken(null);
        service.reset()
    }, [service])

    return <Box>
        <Message speaker="Salieri" text={welcome_text} />
        {
            (service.state === "hint_ready") &&
            <InputBox
                question={userQuestion}
                setQuestion={setUserQuestion}
                captcha_token={captchaToken}
                set_captcha_token={setCaptchaToken}
                suggested_questions={suggested_questions}
                submit={() => { if (captchaToken != null) { service.ask(userQuestion, captchaToken) } }}
                max_length={300} // TODO: enforce max length in backend
            />
        }
        {
            // User Question
            (service.state === "answering" || service.state === "done" || service.state === "error") &&
            <Message speaker="you" text={userQuestion} />
        }
        {
            // Salieri Response
            (service.state === "answering" || service.state === "done" || service.state === "error") && service.answer != null &&
            <ResponseBox answering={service.state === "answering"} answer={service.answer} onStartOver={() => { reset() }} />
        }
        {
            // Salieri Warning
            (service.warning != null) &&
            <WrapAlert severity="warning">
                {service.warning}
            </WrapAlert>
        }
        {
            // Salieri Error
            (service.error != null) &&
            <WrapAlert severity="error">
                {service.error}
            </WrapAlert>

        }
        {
            // Start Over
            (service.state === "answering" || service.state === "done" || service.state === "error") &&
            <Box sx={{
                display: "flex",
                justifyContent: "flex-end",
                ...wrap,
            }}
            >
                <Grow in={service.state !== "answering"} timeout={400}>
                    <Button variant="outlined" startIcon={<ReplayIcon />} color="secondary"
                        onClick={() => {
                            reset()
                        }}
                    >
                        Start Over
                    </Button>
                </Grow>
            </Box>
        }


    </Box>
}
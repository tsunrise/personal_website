import { Box, TextField, Typography, Button, Collapse, Grow, LinearProgress, CircularProgress, Alert, Link, Grid, List, ListItemIcon, ListItem, ListItemText, IconButton, Snackbar, Tooltip } from "@mui/material"
import { blue, grey } from "@mui/material/colors"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import ReplayIcon from '@mui/icons-material/Replay';
import SendIcon from '@mui/icons-material/Send';
import BoltIcon from '@mui/icons-material/Bolt';
import LinkIcon from '@mui/icons-material/Link';
import IosShareIcon from '@mui/icons-material/IosShare';
import CloseIcon from '@mui/icons-material/Close';
import { DummySalieriBackend, SalieriAPIBackend, useSalieri } from "./service";
import AttributionIcon from '@mui/icons-material/Attribution';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import { styled } from "@mui/system";
import { Turnstile, TurnstileInstance } from "@marsidev/react-turnstile";
import "./loading.css"

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
                aria-label="Message Input Box to Salieri"
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
                    <Link sx={{
                        fontSize: 12,
                        color: grey[500]
                    }}
                        component="button"
                        variant="body2"
                        onClick={() => {
                            captcha_ref.current?.reset();
                        }}
                    >
                        Cannot see the captcha?
                    </Link>
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
        <Message speaker='"Tom"' text={props.answer} />
        {/* Make middle */}
        <Box sx={{
            display: props.answering ? "flex" : "none",
            justifyContent: "center",
            alignItems: "center",
            marginTop: 1,
            marginBottom: 1,
        }}>
            <div className="dot-flashing"></div>
        </Box>

    </Box>
}

const IntroListItem = (props: {
    icon: React.ReactElement,
    children: React.ReactNode
}) => {
    return <ListItem sx={{
        padding: 0,
        justifyContent: {
            xs: "center",
        }
    }}>
        <ListItemIcon sx={{
            minWidth: 0,
            marginRight: 1,
        }}>
            {props.icon}
        </ListItemIcon>
        <ListItemText sx={{
            fontSize: {
                xs: 14,
                sm: 16,
            },
            fontWeight: 400,
            fontFamily: "Source Sans Pro",
            color: grey[800],
            marginRight: 1,
        }}>
            {props.children}
        </ListItemText>
    </ListItem>
}


export const Salieri = () => {
    // initialize Salieri Service

    const [userQuestion, setUserQuestion] = useState("")
    const backend = useMemo(() => SalieriAPIBackend, [])
    // const backend = useMemo(() => DummySalieriBackend, [])
    // captcha
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);

    const reset_handler = useCallback(() => {
        setUserQuestion("");
        setCaptchaToken(null);
        setReportAbuseActive(false);
    }, [])
    const service = useSalieri(backend, reset_handler)


    const suggested_questions = (service.hints == null) ? [] : service.hints.suggested_questions
    const welcome_text = (service.hints == null) ? "" : service.hints.welcome
    const announcement = (service.hints == null) ? null : service.hints.announcement

    const [reportAbuseActive, setReportAbuseActive] = useState<boolean>(false);

    const reset = service.reset;

    const [notifMsg, setNotifMsg] = useState<string | null>(null);
    const [notifOpen, setNotifOpen] = useState(false);
    const [notifSuccessStatus, setNotifSuccessStatus] = useState(false);

    const displayNotif = useCallback((msg: string, success: boolean) => {
        setNotifMsg(msg);
        setNotifSuccessStatus(success);
        setNotifOpen(true);
    }, [])

    const handleCopyLink = useCallback(() => {
        navigator.clipboard.writeText(window.location.href).then(() => {
            displayNotif("Link copied to clipboard", true);
        }).catch(() => {
            displayNotif("Failed to copy link", false);
        }
        )
    }, [displayNotif])

    const handleShare = useCallback(() => {
        if (navigator.share) {
            navigator.share({
                title: 'Salieri System by Tom Shen',
                text: service.question ?? "",
                url: window.location.href,
            })
                .then(() => console.log('Successful share'))
                .catch((error) => console.log('Error sharing', error));
        } else {
            navigator.clipboard.writeText(window.location.href).then(() => {
                displayNotif("Your browser does not support sharing. Link copied to clipboard", true);
            }).catch(() => {
                displayNotif("Failed to copy link", false);
            })
        }
    }, [service.question, displayNotif])

    return <Box>
        {
            service.state === "initializing" &&
            <Box sx={{
                display: 'flex', justifyContent: "center"
            }}>
                <CircularProgress />
            </Box>
        }

        {
            // welcome
            (service.state === "hint_ready" || service.state === "answering" || service.state === "done" || service.state === "done_history" || service.state === "error_loading_answer")
            &&
            <>
                <Box>
                    <Grid container spacing={2}>
                        <Grid item xs={4} md={6}>
                            {/* Show a text logo: Salieri System, with foot text aligned to the right: by Tom Shen */}
                            <Typography variant="h4" sx={{
                                fontWeight: 700,
                                fontFamily: "Source Sans Pro",
                                color: blue[700],
                                textAlign: "right",
                                fontSize: {
                                    xs: 16,
                                    sm: 24,
                                    md: 32,
                                }
                            }}>
                                Salieri System
                            </Typography>
                            <Typography variant="body2" sx={{
                                fontWeight: 400,
                                fontFamily: "Source Sans Pro",
                                color: grey[700],
                                textAlign: "right",
                                fontSize: {
                                    xs: 12,
                                    sm: 16,
                                }
                            }}>
                                by Tom Shen
                            </Typography>
                        </Grid>

                        <Grid item xs={8} md={6} sx={{
                        }}>
                            <List dense sx={{
                                marginTop: 0,
                                paddingTop: {
                                    xs: 0,
                                    sm: 1
                                },
                            }}>
                                <IntroListItem icon={<AttributionIcon sx={{
                                    color: grey[800],
                                    // fontSize: 16
                                }} />}>
                                    A lossy copy of the real Tom.
                                </IntroListItem>
                                <IntroListItem icon={<ReportProblemOutlinedIcon sx={{
                                    color: grey[800],
                                }} />}>
                                    May <Link href="https://en.wikipedia.org/wiki/Hallucination_(artificial_intelligence)" target="_blank" rel="noreferrer" color="inherit"
                                    >confidently</Link> produce incorrect answer.
                                </IntroListItem>
                            </List>
                        </Grid>
                    </Grid>
                    {service.state === "done_history" &&
                        <>
                            <WrapAlert severity="info">
                                <b>This is a past conversation.</b> The content is unmoderated and could potentially include offensive material. The answer may also be outdated.
                                <Link sx={{ cursor: "pointer", marginLeft: 1 }} target="_blank" rel="noreferrer" variant="body2" onClick={() => { setReportAbuseActive(true) }}>
                                    Report Abuse
                                </Link>
                            </WrapAlert>
                            {reportAbuseActive &&
                                <WrapAlert severity="info">
                                    <Box>
                                        <b>Report Abuse: </b>
                                        <Link target="_blank" rel="noreferrer" variant="body2" href="https://forms.gle/QiCrtnxwzMxGLUYd8">via Google Form</Link>
                                        <Link target="_blank" rel="noreferrer" variant="body2" href="mailto:dh5ek61f4@mozmail.com" sx={{ marginLeft: 1 }}>via Email</Link>
                                    </Box>
                                </WrapAlert>
                            }
                        </>

                    }
                </Box>
                {
                    (service.state === "hint_ready") && (announcement != null) && <WrapAlert severity="info">
                        {announcement}
                    </WrapAlert>
                }
                <Message speaker='"Tom"' text={welcome_text} />
            </>
        }

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
            (service.state === "answering" || service.state === "done" || service.state === "done_history" || service.state === "error_loading_answer") &&
            <Message speaker={
                service.state === "done_history" ? "\"You\"" : "You"
            } text={service.question ?? ""} />
        }
        {
            // Salieri Response
            (service.state === "answering" || service.state === "done" || service.state === "done_history" || service.state === "error_loading_answer") && service.answer != null &&
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
            // Actions
            (service.state === "answering" || service.state === "done" || service.state === "done_history" || service.state === "error_loading_answer" || service.state === "error_loading_hints") &&
            <Box sx={{
                display: "flex",
                justifyContent: "flex-end",
                ...wrap,
            }}
            >
                {navigator.share != undefined &&
                    <Grow in={service.state !== "answering"} timeout={800}>
                        <Tooltip title="Share">
                            <IconButton color="secondary" onClick={() => {
                                handleShare()
                            }}>
                                <IosShareIcon />
                            </IconButton>
                        </Tooltip>
                    </Grow>}
                <Grow in={service.state !== "answering"} timeout={800}>
                    <Tooltip title="Copy link">
                        <IconButton color="secondary" sx={{
                            marginRight: 1
                        }} onClick={() => {
                            handleCopyLink()
                        }}>
                            <LinkIcon />
                        </IconButton>
                    </Tooltip>
                </Grow>
                <Grow in={service.state !== "answering"} timeout={400}>
                    <Button variant="outlined" startIcon={<ReplayIcon />} color="secondary"
                        onClick={() => {
                            reset()
                        }}
                    >
                        Start Over
                    </Button>
                </Grow>
                <Snackbar open={notifOpen} autoHideDuration={3000} onClose={() => { setNotifOpen(false) }} >
                    <Alert onClose={() => { setNotifOpen(false) }} severity={notifSuccessStatus ? "success" : "error"} sx={{ width: '100%' }}>
                        {notifMsg}
                    </Alert>
                </Snackbar>
            </Box>

        }


    </Box>
}
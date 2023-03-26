import { Box, TextField, Typography, Button, Collapse, Grow, Grid, LinearProgress, Alert } from "@mui/material"
import { blue, grey } from "@mui/material/colors"
import { useState } from "react"
import ReplayIcon from '@mui/icons-material/Replay';
import SendIcon from '@mui/icons-material/Send';

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

const Message = (prop: { speaker: string, text: string }) => {

    return <Box>
        <SpeakerTypography speaker={prop.speaker} />
        <Typography variant="body1" sx={{
            fontWeight: 400,
            textTransform: "none",
            ...wrap,
        }}>{prop.text}</Typography>
    </Box>
}

const InputBox = (props: {
    question: string,
    setQuestion: (question: string) => void,
    suggested_questions: string[],
    submit: () => void,
    max_length: number,
}) => {

    const inputIsEmpty = props.question === ""
    const lengthRatio = Math.min(props.question.length / props.max_length, 1)
    const lengthExceeded = props.question.length > props.max_length
    const displayProgress = lengthRatio > 0.8 && !lengthExceeded;

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
            {/* Reset and Submit button. Reset button is an icon, and submit button is text button*/}
            <Collapse in={lengthExceeded}>
                <Grow in={lengthExceeded} timeout={400}>
                    <Alert severity="error" sx={{
                        marginLeft: 2,
                        marginRight: 2,
                        marginBottom: 1,
                    }}>
                        Your question is too long. ({props.question.length}/{props.max_length})
                    </Alert>
                </Grow>
            </Collapse>

            <Box sx={{
                display: "flex",
                justifyContent: "flex-end",
                ...wrap,
            }}
            >
                <Grow in={!inputIsEmpty} timeout={400}>
                    <Button variant="outlined" startIcon={<ReplayIcon />} color="secondary"
                        onClick={() => {
                            props.setQuestion("")
                        }}
                    >
                        Start Over
                    </Button>
                </Grow>
                <Grow in={!inputIsEmpty} timeout={800}>
                    <Button variant="contained" endIcon={<SendIcon />} color="primary" sx={{
                        marginLeft: 1,
                    }}
                        onClick={() => {
                            props.submit()
                        }}
                        disabled={lengthExceeded}
                    >
                        Send
                    </Button>
                </Grow>
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

const welcome_text = `Hi, I'm Tom's friend Salieri! Whether you're curious about Tom's work, hobbies, or favorites, I'm here to instantly assist you—anytime.`

// const placement_text = `The meaning of life is a philosophical and existential question that has been contemplated by humans for millennia. It involves seeking to understand the significance, purpose, or value of life and existence. Many people have approached the question from religious, philosophical, scientific, and existential perspectives.`



export const Salieri = () => {
    // initialize Salieri Service


    const [userQuestion, setUserQuestion] = useState("")

    return <Box>
        <Message speaker="Salieri" text={welcome_text} />
        <InputBox
            question={userQuestion}
            setQuestion={setUserQuestion}
            suggested_questions={["Hello this is question 1", "Hello this is question 2"]}
            submit={() => { console.log("submit") }}
            max_length={300}
        />
        {/* <Message speaker="you" text="What's the meaning of life?" />
        <Message speaker="Salieri" text={placement_text} /> */}
    </Box>
}
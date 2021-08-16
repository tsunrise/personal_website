import React from "react";
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Box,
    createStyles,
    fade,
    makeStyles,
    Theme,
    Typography
} from "@material-ui/core";
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
interface Props {

}

const useStyles = makeStyles((theme: Theme) => createStyles({

}))

export default function ContactBar(props: Props) {
    return <Box><Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon/>}>
            <Typography>Github</Typography>
        </AccordionSummary>
        <AccordionDetails>
            <Typography>
                Here are some Github details.
            </Typography>
        </AccordionDetails>
    </Accordion>
    <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon/>}>
            <Typography>Telegram</Typography>
        </AccordionSummary>
        <AccordionDetails>
            <Typography>
                Here are some Telegram details.
            </Typography>
        </AccordionDetails>
    </Accordion>
    <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon/>}>
            <Typography>Facebook</Typography>
        </AccordionSummary>
        <AccordionDetails>
            <Typography>
                Here are some Facebook details.
            </Typography>
        </AccordionDetails>
    </Accordion></Box>
}
import {Box, createStyles, Divider, makeStyles, Theme, Typography} from "@material-ui/core";
import Timeline from '@material-ui/lab/Timeline';
import TimelineItem from '@material-ui/lab/TimelineItem';
import TimelineSeparator from '@material-ui/lab/TimelineSeparator';
import TimelineConnector from '@material-ui/lab/TimelineConnector';
import TimelineContent from '@material-ui/lab/TimelineContent';
import TimelineOppositeContent from '@material-ui/lab/TimelineOppositeContent';
import TimelineDot from '@material-ui/lab/TimelineDot';
import {School} from "@material-ui/icons";
import DividerWithText from "./textDivider";

interface Props {

}

const useStyles = makeStyles((theme: Theme) => createStyles({
    root: {
        padding: 4
    },
    title: {
        padding: 10
    }
}))

export default function BackgroundInfo(props: Props) {
    const classes = useStyles(props)
    return <Box className={classes.root}>
        <DividerWithText>Background</DividerWithText>
        <Timeline align="left">
            <TimelineItem>
                <TimelineOppositeContent>
                    <Typography variant="body2" color="textSecondary">
                        2017
                    </Typography>
                </TimelineOppositeContent>
                <TimelineSeparator>
                    <TimelineDot>
                        <School/>
                    </TimelineDot>
                </TimelineSeparator>
                <TimelineContent>
                    Join school.
                </TimelineContent>
            </TimelineItem>


        </Timeline>
    </Box>
}
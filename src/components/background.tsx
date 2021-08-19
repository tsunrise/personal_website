import {Box, createStyles, Divider, makeStyles, Paper, Theme, Typography} from "@material-ui/core";
import Timeline from '@material-ui/lab/Timeline';
import TimelineItem from '@material-ui/lab/TimelineItem';
import TimelineSeparator from '@material-ui/lab/TimelineSeparator';
import TimelineConnector from '@material-ui/lab/TimelineConnector';
import TimelineContent from '@material-ui/lab/TimelineContent';
import TimelineOppositeContent from '@material-ui/lab/TimelineOppositeContent';
import TimelineDot from '@material-ui/lab/TimelineDot';
import {Computer, Flag, School, Work} from "@material-ui/icons";
import DividerWithText from "./textDivider";

interface Props {

}

const useStyles = makeStyles((theme: Theme) => createStyles({
    root: {
        padding: 4
    },
    title: {
        padding: 10
    },
    paper: {
        padding: `6px 16px`
    },
    timeline_time: {
        [theme.breakpoints.down("xs")]: {
            flex: 0.182
        },
        [theme.breakpoints.up("sm")]: {
            flex: 0.2
        },
    }
}))

interface BackgroundEntry {
    time: string | number,
    icon: JSX.Element,
    icon_color?: "inherit" | "grey" | "primary" | "secondary" | undefined,
    header: string,
    main: string,
    end?: boolean
}

const entries: BackgroundEntry[] = [
    {
        time: `2018`,
        icon: <School/>,
        icon_color: "primary",
        header: `As Freshman`,
        main: `UC Berkeley`,
    },
    {
        time: `2020`,
        icon: <Computer/>,
        icon_color: "primary",
        header: `Undergraduate Research`,
        main: `RISELab`,
    },
    {
        time: `2021`,
        icon: <Work/>,
        icon_color: "primary",
        header: `Backend Software Engineer Intern`,
        main: `Arista Networks`,
        end: true
    },

]

export default function BackgroundInfo(props: Props) {
    const classes = useStyles(props)
    const timeline_items = entries.map(entry => <TimelineItem>
        <TimelineOppositeContent className={classes.timeline_time}>
            <Typography variant="body2" color="textSecondary">
                {entry.time}
            </Typography>
        </TimelineOppositeContent>
        <TimelineSeparator>
            <TimelineDot color={entry.icon_color}>
                {entry.icon}
            </TimelineDot>
            {entry.end ? null : <TimelineConnector/>}
        </TimelineSeparator>
        <TimelineContent>
            <Paper elevation={3} className={classes.paper}>
                <Typography variant="body2" color="primary">
                    {entry.header}
                </Typography>
                <Typography variant="h6">
                    {entry.main}
                </Typography>
            </Paper>
        </TimelineContent>
    </TimelineItem>)

    return <Box className={classes.root}>
        <DividerWithText>Background</DividerWithText>
        <Timeline align="left">
            {timeline_items}
        </Timeline>
    </Box>
}
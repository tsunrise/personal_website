import {Box, Collapse, createStyles, Grid, IconButton, makeStyles, Theme} from "@material-ui/core";
import React, {useState} from "react";
import GitHubIcon from '@material-ui/icons/GitHub';
import TelegramIcon from '@material-ui/icons/Telegram';
import FacebookIcon from '@material-ui/icons/Facebook';
import WechatIcon from "../../images/icons/wechat";
import {blue, green, grey} from "@material-ui/core/colors";

interface Props {

}

enum Status {
    Inactive,
    Github,
    Facebook,
    Telegram,
    Wechat
}

interface contentProp {
    status: Status
}

const useGadgetStyles = makeStyles((theme: Theme) => createStyles({
    fullWidth: {
        width: '100%'
    },
    imgIcon: {
        height: '100%'
    },
    iconColorTransition: {
        transition: theme.transitions.create(['color'], {duration: theme.transitions.duration.standard})
    }
}))


function ContactContent(prop: contentProp) {

    return <Box>
        <Collapse in={prop.status === Status.Github} mountOnEnter unmountOnExit>
            Github Content
        </Collapse>
        <Collapse in={prop.status === Status.Telegram} mountOnEnter unmountOnExit>
            Telegram Content
        </Collapse>
        <Collapse in={prop.status === Status.Facebook} mountOnEnter unmountOnExit>
            Facebook Content
        </Collapse>
        <Collapse in={prop.status === Status.Wechat} mountOnEnter unmountOnExit>
            WeChat Content
        </Collapse>
    </Box>
}

export default function ContactGadget(prop: Props) {

    const [contactState, setContactState] = useState(Status.Inactive);
    const classes = useGadgetStyles(prop);
    const toggleContactState = (s: Status) => {
        if (contactState === s) {
            setContactState(Status.Inactive);
        } else {
            setContactState(s);
        }
    }

    const activeColor = (activeState: Status, color: string) => {
        if (contactState === activeState) {
            return {color: color}
        } else {
            return {color: grey[500]}
        }
    }


    return <Grid container className={classes.fullWidth} justify="center" direction="column" alignItems="center">
        <Grid item>
            <IconButton className={classes.iconColorTransition} onClick={() => {
                toggleContactState(Status.Github)
            }} style={activeColor(Status.Github, grey[900])}>
                <GitHubIcon/>
            </IconButton>
            <IconButton className={classes.iconColorTransition} onClick={() => {
                toggleContactState(Status.Facebook)
            }} style={activeColor(Status.Facebook, blue[900])}>
                <FacebookIcon/>
            </IconButton>
            <IconButton className={classes.iconColorTransition} onClick={() => {
                toggleContactState(Status.Telegram)
            }} style={activeColor(Status.Telegram, blue[300])}>
                <TelegramIcon/>
            </IconButton>
            <IconButton className={classes.iconColorTransition} onClick={() => {
                toggleContactState(Status.Wechat)
            }} style={activeColor(Status.Wechat, green[800])}>
                <WechatIcon/>
            </IconButton>
        </Grid>

        <Grid item>
            <ContactContent status={contactState}/>
        </Grid>

    </Grid>
}
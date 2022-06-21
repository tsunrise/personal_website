import {
    Avatar,
    Button,
    Card,
    CardContent,
    CardHeader,
    Collapse,
    createStyles,
    Grid,
    IconButton,
    makeStyles,
    Theme,
} from "@material-ui/core";
import React, {cloneElement, useState} from "react";
import GitHubIcon from '@material-ui/icons/GitHub';
import TelegramIcon from '@material-ui/icons/Telegram';
import FacebookIcon from '@material-ui/icons/Facebook';
import WechatIcon from "../../images/icons/wechat";
import {blue, green, grey} from "@material-ui/core/colors";
import githubAvatar from "../../images/github_avatar.jpg";
import totoroAvatar from "../../images/totoro.jpg";
import facebookAvatar from "../../images/facebook_avatar.bmp";
import wechatQRCode from "../../images/qr-code.svg";
import {Email} from "@material-ui/icons";

interface Props {

}

enum Status {
    Inactive,
    Github,
    Facebook,
    Telegram,
    Wechat,
    Email
}

interface contentProp {
    status: Status,
    toggleStatus: (status: Status) => void
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
    },
}))

const useContentStyles = makeStyles((_theme: Theme) => createStyles({
    cardRoot: {
        width: '100%'
    },
    buttonContainer: {
        display: 'flex',
        flexDirection: `row`,
        justifyContent: 'center'
    },
    clickable: {
        cursor: 'pointer'
    },
    jobButton: {
        marginRight: 1,
        marginLeft: 1
    }
}))

const githubAPI = "https://api.github.com/users/tsunrise";

function ContactContent(prop: contentProp) {
    const classes = useContentStyles(prop);

    const makeCardHeader = (avatar: string, alt: string, target: string, title: string, subheader: string) =>
        <CardHeader
            avatar={
                <Avatar src={avatar} alt={alt} onClick={() => {
                    window.open(target, '_blank')
                }} className={classes.clickable}/>
            }
            title={title}
            subheader={subheader}
        />

    const makeActionButton = (text: string, action: () => void, color: 'inherit' | 'primary' | 'secondary' | 'default') =>
        <Button size="small" variant="outlined" style={{width: '100%'}} onClick={action} color={color}>{text}</Button>
    const makeButton = (text: string, target: string, color: 'inherit' | 'primary' | 'secondary' | 'default') =>
        makeActionButton(text, () => {
            window.open(target, '_blank')
        }, color)

    const githubLink = "https://github.com/tsunrise"

    const [githubAvatarLink, setGithubAvatarLink] = useState(githubAvatar)
    fetch(githubAPI).then(res => res.json()).then(res => {
        setGithubAvatarLink(res.avatar_url)
    });

    const githubContent = <Card className={classes.cardRoot} elevation={0}>
        {makeCardHeader(githubAvatarLink, "Github Avatar", githubLink, "Tom Shen", "@tsunrise")}
        <CardContent className={classes.buttonContainer}>
            {makeButton("View Profile", githubLink, "inherit")}
        </CardContent>
    </Card>

    const telegramLink = "https://t.me/tsunrise"
    const telegramContent = <Card className={classes.cardRoot} elevation={0}>
        {makeCardHeader(totoroAvatar, "Telegram Avatar", telegramLink, "Tom Shen", "@tsunrise")}
        <CardContent className={classes.buttonContainer}>
            {makeButton("Send Message", telegramLink, "primary")}
        </CardContent>
    </Card>

    const facebookLink = "https://www.facebook.com/tomshen.h"
    const facebookContent = <Card className={classes.cardRoot} elevation={0}>
        {makeCardHeader(facebookAvatar, "Facebook Avatar", facebookLink, "Tom Shen", "@tomshen.h")}
        <CardContent className={classes.buttonContainer}>
            {makeButton("View Profile", facebookLink, "primary")}
        </CardContent>
    </Card>

    const wechatContent = <Card className={classes.cardRoot} elevation={0}>
        <CardHeader
            avatar={
                <Avatar src={totoroAvatar} alt={"Wechat Avatar"}/>
            }
            title={"Tom Shen"}
            subheader="Use Wechat App to scan QR Code"
        />
        <CardContent style={{display: 'flex', flexDirection: "row", justifyContent: "center"}}>
            <img src={wechatQRCode} alt="wechat QR code" style={{width: '100%', maxWidth: '200px'}}/>
        </CardContent>
    </Card>
    // for email content, display an addition small line on the bottom showing when should use email
    const emailContent = <Card className={classes.cardRoot} elevation={0}>
        <CardHeader
            avatar={
                <Avatar alt={"Email Avatar"}>
                    <Email/>
                </Avatar>
            }
            title={"Tom Shen"}
            subheader="me <at> tomshen.io"
        />
    </Card>

    return <Grid item xs={12}>
        <Collapse in={prop.status === Status.Github} mountOnEnter unmountOnExit>
            {githubContent}
        </Collapse>
        <Collapse in={prop.status === Status.Telegram} mountOnEnter unmountOnExit>
            {telegramContent}
        </Collapse>
        <Collapse in={prop.status === Status.Facebook} mountOnEnter unmountOnExit>
            {facebookContent}
        </Collapse>
        <Collapse in={prop.status === Status.Wechat} mountOnEnter unmountOnExit>
            {wechatContent}
        </Collapse>
        <Collapse in={prop.status === Status.Email} mountOnEnter unmountOnExit>
            {emailContent}
        </Collapse>
        <CardContent className={classes.buttonContainer}>
            {cloneElement(makeButton("Resume", "/resume.pdf", "secondary"), {className: classes.jobButton})}
            {cloneElement(makeActionButton("Email", () => prop.toggleStatus(Status.Email), "secondary"), {className: classes.jobButton})}
        </CardContent>

    </Grid>
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
                toggleContactState(Status.Telegram)
            }} style={activeColor(Status.Telegram, blue[300])}>
                <TelegramIcon/>
            </IconButton>
            <IconButton className={classes.iconColorTransition} onClick={() => {
                toggleContactState(Status.Facebook)
            }} style={activeColor(Status.Facebook, blue[900])}>
                <FacebookIcon/>
            </IconButton>
            <IconButton className={classes.iconColorTransition} onClick={() => {
                toggleContactState(Status.Wechat)
            }} style={activeColor(Status.Wechat, green[800])}>
                <WechatIcon/>
            </IconButton>
        </Grid>

        <Grid item container direction="row">
            <Grid xs={12}>
                <ContactContent status={contactState} toggleStatus={toggleContactState}/>
            </Grid>
        </Grid>


    </Grid>
}
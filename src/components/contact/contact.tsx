import {
    Avatar,
    Button,
    Card,
    CardContent,
    CardHeader,
    Collapse,
    Grid,
    IconButton,
} from "@mui/material";
import { useState } from "react";
import GitHubIcon from '@mui/icons-material/GitHub';
import TelegramIcon from '@mui/icons-material/Telegram';
import FacebookIcon from '@mui/icons-material/Facebook';
import WechatIcon from "../../images/icons/wechat";
import { blue, green, grey } from "@mui/material/colors";
import majoAvatar from "../../images/majo.png";
import telegramAvatar from "../../images/telegram.jpg";
import wechatQRCode from "../../images/qr-code.svg";
import { Email } from "@mui/icons-material";
import { styled } from "@mui/system";

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

const CardRoot = styled(Card)(({ theme }) => ({
    width: '100%',
}))

const ButtonContainer = styled(CardContent)({
    display: 'flex',
    flexDirection: `row`,
    justifyContent: 'center'
})

const ActionButton = ({ text, action, color }: { text: string, action: () => void, color: 'inherit' | 'primary' | 'secondary' }) => {
    return <Button size="small" variant="outlined" style={{
        width: '100%', marginRight: 1, marginLeft: 1
    }} onClick={action} color={color}>{text}</Button>
}

const LinkButton = ({ text, target, color }: { text: string, target: string, color: 'inherit' | 'primary' | 'secondary' }) => {
    return <ActionButton text={text} action={() => {
        window.open(target, '_blank')
    }} color={color} />
}

const githubLink = "https://github.com/tsunrise"
const telegramLink = "https://t.me/tsunrise"
const facebookLink = "https://www.facebook.com/tomshen.h"

function ContactContent(prop: contentProp) {

    const makeCardHeader = (avatar: string, alt: string, target: string, title: string, subheader: string) =>
        <CardHeader
            avatar={
                <Avatar src={avatar} alt={alt} onClick={() => {
                    window.open(target, '_blank')
                }} sx={{
                    cursor: 'pointer'
                }} />
            }
            title={title}
            subheader={subheader}
        />

    const githubContent = <CardRoot elevation={0}>
        {makeCardHeader(majoAvatar, "Github Avatar", githubLink, "Tom Shen", "@tsunrise")}
        <ButtonContainer>
            <LinkButton text="View Profile" target={githubLink} color="inherit" />
        </ButtonContainer>
    </CardRoot>

    const telegramContent = <CardRoot elevation={0}>
        {makeCardHeader(telegramAvatar, "Telegram Avatar", telegramLink, "Tom Shen", "@tsunrise")}
        <ButtonContainer>
            <LinkButton text="Send Message" target={telegramLink} color="primary" />
        </ButtonContainer>
    </CardRoot>

    const facebookContent = <CardRoot elevation={0}>
        {makeCardHeader(majoAvatar, "Facebook Avatar", facebookLink, "Tom Shen", "@tomshen.h")}
        <ButtonContainer>
            <LinkButton text="View Profile" target={facebookLink} color="primary" />
        </ButtonContainer>
    </CardRoot>

    const wechatContent = <CardRoot elevation={0}>
        <CardHeader
            avatar={
                <Avatar src={majoAvatar} alt={"Wechat Avatar"} />
            }
            title={"Tom Shen"}
            subheader="Use Wechat App to scan QR Code"
        />
        <CardContent style={{ display: 'flex', flexDirection: "row", justifyContent: "center" }}>
            <img src={wechatQRCode} alt="wechat QR code" style={{ width: '100%', maxWidth: '200px' }} />
        </CardContent>
    </CardRoot>
    // for email content, display an addition small line on the bottom showing when should use email
    const emailContent = <CardRoot elevation={0}>
        <CardHeader
            avatar={
                <Avatar alt={"Email Avatar"}>
                    <Email />
                </Avatar>
            }
            title={"Tom Shen"}
            subheader="me <at> tomshen.io"
        />
    </CardRoot>

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
        <ButtonContainer>
            <LinkButton text="Resume" target="/resume.pdf" color="secondary" />
            <ActionButton text="Email" action={() => prop.toggleStatus(Status.Email)} color="secondary" />
        </ButtonContainer>

    </Grid>
}


const MyIconButton = styled(IconButton, {
    shouldForwardProp: (prop) => prop !== 'activeStatus' && prop !== 'activeColor'
})<{ activeStatus: boolean, activeColor: string }>(({ theme, activeStatus, activeColor }) => ({
    transition: (theme.transitions as any).create(['color'], { duration: (theme.transitions as any).duration.standard }),
    color: activeStatus ? activeColor : grey[500],
}));

export default function ContactGadget(prop: Props) {

    const [contactState, setContactState] = useState(Status.Inactive);
    const toggleContactState = (s: Status) => {
        if (contactState === s) {
            setContactState(Status.Inactive);
        } else {
            setContactState(s);
        }
    }


    return <Grid container justifyContent="center" direction="column" alignItems="center" sx={{
        width: '100%',
    }
    }>
        <Grid item>
            <MyIconButton activeStatus={contactState === Status.Github} activeColor={grey[900]} onClick={() => {
                toggleContactState(Status.Github)
            }}
                aria-label="github"
            > <GitHubIcon /> </MyIconButton>
            <MyIconButton activeStatus={contactState === Status.Telegram} activeColor={blue[300]} onClick={() => {
                toggleContactState(Status.Telegram)
            }}
                aria-label="telegram"
            > <TelegramIcon /> </MyIconButton>
            <MyIconButton activeStatus={contactState === Status.Facebook} activeColor={blue[900]} onClick={() => {
                toggleContactState(Status.Facebook)
            }}
                aria-label="facebook"
            > <FacebookIcon /> </MyIconButton>
            <MyIconButton activeStatus={contactState === Status.Wechat} activeColor={green[800]} onClick={() => {
                toggleContactState(Status.Wechat)
            }}
                aria-label="wechat"
            > <WechatIcon /> </MyIconButton>
        </Grid>

        <Grid item container direction="row">
            <Grid item xs={12}>
                <ContactContent status={contactState} toggleStatus={toggleContactState} />
            </Grid>
        </Grid>


    </Grid >
}
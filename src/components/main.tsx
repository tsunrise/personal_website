//! defines the website layout

import React, {useEffect, useState} from "react";
import {createStyles, Divider, Grid, Hidden, makeStyles, Theme, Typography} from "@material-ui/core";
import HeadBar from "./headbar";
import Heading from "./heading";
import Introduction from "./introduction";
import ContactGadget from "./contact/contact";
import BackgroundInfo from "./background";
import Footprints from "./foorprint";


const useStyles = makeStyles((theme: Theme) => createStyles({
    root: {
        flexGrow: 1
    },
    body: {
        [theme.breakpoints.up("sm")]:{
            paddingTop: theme.spacing(4),
        }
    },
    paper: {
        padding: theme.spacing(2),
        textAlign: 'center',
        color: theme.palette.text.secondary,
    },
    fullWidth: {
        width: '100%'
    },
    mainItem: {
        marginTop: 5
    },
    rightBar: {
        [theme.breakpoints.down("xs")]: {
            display: 'None'
        }
    },
    bottomDivider: {
        marginTop: theme.spacing(3),
        marginBottom: theme.spacing(2)
    }
}))

export default function MainGrid() {
    const [isMiddle, setIsMiddle] = useState(false);
    // handles the blur level of the heading
    const [headerBlurLevel, setHeaderBlurLevel] = useState(0);

    const styleProps = {
        titleColor: isMiddle ? "black" : "white"
    }
    const classes = useStyles(styleProps);

    const handleScroll = () => {
        const threshold = 20;
        setHeaderBlurLevel(Math.min((window.scrollY - threshold) / 7, 10) / 10)
        if (window.scrollY > threshold) {
            setIsMiddle(true)
        }else{
            setIsMiddle(false)
        }
    }

    useEffect(() => {
        window.addEventListener("scroll", handleScroll);
        return () => {window.removeEventListener("scroll", handleScroll)}
    })

    return (
        <Grid container className={classes.root} justify="center">

            <HeadBar isScrollMiddle={isMiddle}/>

            {/*Global-wide headings, containing image*/}
            <Heading isScrollMiddle={isMiddle} disappearLevel={headerBlurLevel}/>

            {/*Page-wide Width Adjustment*/}
            <Grid item container xs={12} sm={11} md={9} lg={8} xl={6} spacing={1} className={classes.body}>
                <Grid item container xs={12} md={9} direction="column">
                    <Grid item className={classes.mainItem}>
                        <Hidden mdUp>
                            <ContactGadget/>
                        </Hidden>
                    </Grid>

                    <Grid item className={classes.mainItem}>
                        <Introduction/>
                    </Grid>
                    <Grid item className={classes.mainItem}>
                        <BackgroundInfo/>
                    </Grid>
                    <Grid item className={classes.mainItem}>
                        <Footprints/>
                    </Grid>
                    <Grid item className={classes.mainItem}>
                        <Divider className={classes.bottomDivider}/>
                        <Typography variant="body2" color="textSecondary">
                            © Conghao Shen
                        </Typography>
                    </Grid>

                </Grid>
                    {/*Right Bar: will show contact info and my selfie!*/}
                <Grid item container md={3} className={classes.rightBar}>
                    {/*Contact Information*/}
                    <Grid item className={classes.fullWidth}>
                        <ContactGadget/>
                    </Grid>
                </Grid>
                </Grid>

            </Grid>
    )
}
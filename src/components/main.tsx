//! defines the website layout

import React, {useEffect, useState} from "react";
import {createStyles, Grid, Hidden, makeStyles, Paper, Theme} from "@material-ui/core";
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

    let elementPlaceHolders = []
    for (let i = 0; i < 20; i++) {
        elementPlaceHolders.push(<Grid item className={classes.mainItem}><Paper className={classes.paper}>Item {i}</Paper></Grid>)
    }


    return (
        <Grid container className={classes.root} justify="center">

            <HeadBar isScrollMiddle={isMiddle}/>

            {/*Global-wide headings, containing image*/}
            <Heading isScrollMiddle={isMiddle} disappearLevel={headerBlurLevel}/>

            {/*Page-wide Width Adjustment*/}
            <Grid item container xs={12} sm={10} md={9} lg={7} xl={6} spacing={1} className={classes.body}>
                <Grid item container xs={12} md={8} direction="column">
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

                    {
                        elementPlaceHolders
                    }
                </Grid>
                    {/*Right Bar: will show contact info and my selfie!*/}
                <Grid item container md={4} xs={12}>
                    {/*Contact Information*/}
                    <Grid item className={classes.fullWidth}>
                        <ContactGadget/>
                    </Grid>
                </Grid>
                </Grid>

            </Grid>
    )
}
//! defines the website layout

import React, {useEffect, useState} from "react";
import {createStyles, Grid, makeStyles, Paper, Theme} from "@material-ui/core";
import HeadBar from "./headbar";
import Heading from "./heading";
import ContactBar from "./rightbar/contacts";
import Introduction from "./introduction";



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
                <Grid item container xs={12} sm={10} md={8} lg={7} xl={6} spacing={2} className={classes.body}>
                    <Grid item xs={12} sm={8}>
                        <Paper className={classes.paper}>isMiddle: {isMiddle ? "True" : "False"}</Paper>
                        <Paper className={classes.paper}>
                            <Introduction/>
                        </Paper>
                        <Paper className={classes.paper}>Main</Paper>
                        <Paper className={classes.paper}>Main</Paper>
                        <Paper className={classes.paper}>Main</Paper>
                        <Paper className={classes.paper}>Main</Paper>
                        <Paper className={classes.paper}>Main</Paper>
                        <Paper className={classes.paper}>Main</Paper>
                        <Paper className={classes.paper}>Main</Paper>
                        <Paper className={classes.paper}>Main</Paper>
                        <Paper className={classes.paper}>Main</Paper>
                        <Paper className={classes.paper}>Main</Paper>
                        <Paper className={classes.paper}>Main</Paper>
                        <Paper className={classes.paper}>Main</Paper>
                        <Paper className={classes.paper}>Main</Paper>
                        <Paper className={classes.paper}>Main</Paper>
                    </Grid>
                    {/*Right Bar: will show contact info and my selfie!*/}
                    <Grid item container sm={4} xs={12}>
                        {/*Contact Information*/}
                        <Grid item className={classes.fullWidth}>
                            <ContactBar/>
                        </Grid>
                    </Grid>
                </Grid>

            </Grid>
    )
}
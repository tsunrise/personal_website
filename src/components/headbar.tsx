import {AppBar, createStyles, fade, makeStyles, Theme, Toolbar, Typography} from "@material-ui/core";
import React from "react";

interface Props {
    isScrollMiddle: boolean
}

const useStyles = makeStyles((theme: Theme) => createStyles({
    appBar: {
        boxShadow: (props) => props.isScrollMiddle ? theme.shadows[3] : 'none',
        background: (props) =>
            props.isScrollMiddle ? fade('#ffffff', 0.8) : "none",
        transition: theme.transitions.create(['background']),

    },
    title: {
        color: (props: Props) => props.isScrollMiddle ? "black" : "white",
        transition: theme.transitions.create(['color']) 
    }
}))

export default function HeadBar(props: Props){

    const classes = useStyles(props)

    return <AppBar position="fixed" className={classes.appBar} hidden={false}>
        <Toolbar>
            <Typography variant="h6" className={classes.title}>Tom Shen</Typography>
        </Toolbar>
    </AppBar>
}
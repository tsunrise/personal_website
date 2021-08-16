import {Box, createStyles, Grid, makeStyles, Theme, Typography} from "@material-ui/core";
import React from "react";
import backgroundImg from "../images/bkg.jpg";

interface Props {
    isScrollMiddle: boolean,
    disappearLevel: number
}



const useStyles = makeStyles((theme: Theme) => createStyles({
    header: {
        backgroundImage: `linear-gradient(to bottom, rgba(255,255,255,0) 20%,
              rgba(255,255,255,1)), url(${backgroundImg})`,
        backgroundPosition: 'center',
        backgroundSize: 'cover',
        height: 300,
    },
    disappearOnDemand: {
        filter: (prop: Props) => prop.isScrollMiddle ? `blur(${prop.disappearLevel * 6}px)` : "none",
        transition: theme.transitions.create(['filter'], {duration: 100}),
        // opacity: (prop) => (1 - prop.disappearLevel)
    }
}))

export default function Heading(prop: Props){
    const classes = useStyles(prop)

    return <Grid item container xs={12} className={`${classes.header} ${classes.disappearOnDemand}`} direction="column" alignItems={"center"} justify={"center"}>
        <Grid>
            <Typography variant="h4">Tom Conghao Shen</Typography>
        </Grid>
        <SubHeader content={"Proof of Existence"}/>
    </Grid>
}

const useSubHeaderStyles = makeStyles((theme: Theme) => createStyles({
    subHeader: {
        fontFamily: `consolas, San Francisco Mono, Menlo, serif, sans-serif`,
        paddingTop: `5px`
    }
}))

interface SubHeaderProp{
    content: string
}

function SubHeader(prop: SubHeaderProp) {
    const classes = useSubHeaderStyles(prop)

    return <Box className={classes.subHeader}>{prop.content}</Box>
}
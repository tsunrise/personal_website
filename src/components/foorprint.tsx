import {Box, Button, Card, CardActions, CardContent, makeStyles, Tooltip, Typography} from "@material-ui/core";

import DividerWithText from "./textDivider";
import {Archive, CallMerge, GitHub, ImportExport, LinearScale} from "@material-ui/icons";
import {cloneElement} from "react";

interface Prop {

}

const useStyles = makeStyles((theme) => ({
    root: {
        marginTop: 10,
        display: "flex",
        flexDirection: "column",
        [theme.breakpoints.down("xs")]: {
            marginLeft: 5,
            marginRight: 5,
        },
    },
    upper: {
        display: "flex",
        flexDirection: "row",
        justifyContent: "space-between"
    },
    upperIcon: {
        fontSize: 33
    },
    content: {
        fontSize: 16,
    },
    actionButton: {
        margin: theme.spacing(1),
        marginLeft: "auto"
    }
}));

interface Action {
    name: string,
    icon: JSX.Element,
    link: string,
    disabled?: boolean
}

interface CardItems {
    secondary: string,
    upperIcon: JSX.Element,
    main: string,
    description: string,
    actions: Action[],
}

const items: CardItems[] = [
    {
        secondary: "co-authored with arkworks open-source contributors",
        upperIcon: <CallMerge/>,
        main: "An R1CS Friendly Merkle Tree Implementation",
        description: "Implementation of Merkle Tree using provided or user-defined hash functions." +
            " R1CS arithmetic circuit for merkle tree path verification. Support for different two-to-one hashes and leaf hashes.",
        actions: [
            {name: "Repo", icon: <GitHub/>, link: "https://github.com/arkworks-rs/crypto-primitives"},
            {name: "Crate", icon: <Archive/>, link: "https://crates.io/crates/ark-crypto-primitives"}
        ]
    },
    {
        secondary: "alpha release",
        upperIcon: <LinearScale/>,
        main: "Low Degree Testing for Reed Solomon Code",
        description: "FRI protocol to enforce degree bound of univariate oracle evaluations. Generate succinct proof with size O(Log(degree))." +
            " Come with arithmetic circuit for verifier round function.",
        actions: [
            {name: "Repo", icon: <GitHub/>, link: "https://github.com/arkworks-rs/ldt"},
            {name: "Crate", icon: <Archive/>, link: "#", disabled: true}
        ]
    },
    {
        secondary: "work in progress",
        upperIcon: <ImportExport/>,
        main: "Backend communication server for Federated Learning",
        description: "An asynchronous multi-threaded communication server for federated learning research project." +
            " Support 16000+ concurrent active connections and high bandwidth. ",
        actions: [
            {name: "Repo", icon: <GitHub/>, link: "#", disabled: true},
        ]
    }
]


export default function Footprints(prop: Prop) {
    const classes = useStyles(prop)
    const cards = items.map(item =>
        <Card className={classes.root} elevation={3}>
            <Box>
                <CardContent>
                    <Box className={classes.upper}>
                        <Box>
                            <Typography variant="body2" color="textSecondary">{item.secondary}</Typography>
                            <Typography variant="h5">{item.main}</Typography>
                        </Box>
                        <Box>
                            {cloneElement(item.upperIcon, {className: classes.upperIcon})}
                        </Box>
                    </Box>

                    <Box>
                        <Typography variant="body2" className={classes.content}>{item.description} </Typography>
                    </Box>
                </CardContent>
                <CardActions>
                    {item.actions.map(action => {
                        if (action.disabled) {
                            return <Tooltip title="not yet available">
                                <Box className={classes.actionButton}>
                                    <Button color="primary"
                                            startIcon={action.icon} href={action.link} disabled>{action.name}
                                    </Button>
                                </Box>
                            </Tooltip>
                        }
                        return <Button color="primary" className={classes.actionButton}
                                       startIcon={action.icon} href={action.link}>{action.name}
                        </Button>
                    })}
                </CardActions>
            </Box>
        </Card>
    )
    return <Box>
        <DividerWithText>Footprints</DividerWithText>
        {cards}
    </Box>
}
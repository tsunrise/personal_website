import {Box, Button, Card, CardActions, CardContent, CardMedia, makeStyles, Typography} from "@material-ui/core";

import DividerWithText from "./textDivider";
import backgroundImg from "../images/bkg.jpg";
import {Adjust} from "@material-ui/icons";

interface Prop {

}

const useStyles = makeStyles((theme) => ({
    root: {
        marginTop: 10,
        display: "flex",
        [theme.breakpoints.down("xs")]: {
            flexDirection: "column",
            marginLeft: 5,
            marginRight: 5,
        },
        [theme.breakpoints.up("sm")]: {
            flexDirection: "row"
        }
    },
    media: {
        [theme.breakpoints.down("xs")]: {
            height: 250,
        },
        [theme.breakpoints.up("sm")]: {
            width: 250,
        },
    },
    content: {
        padding: 24,
    },
    actionButton: {
        margin: theme.spacing(1),
        marginLeft: "auto"
    }
}));

interface Action {
    name: string,
    icon: JSX.Element,
    link: string
}

interface CardItems {
    imageUrl: string,
    imageTitle: string,
    secondary: string,
    main: string,
    description: string,
    actions: Action[],

}

const items: CardItems[] = [
    {
        imageUrl: backgroundImg,
        imageTitle: "test title",
        secondary: "secondary",
        main: "main item",
        description: "description is here. should be somewhat lengthy. Usually takes some lines",
        actions: [
            {name: "Action", icon: <Adjust/>, link: "https://tomshen.io/"},
            {name: "Action", icon: <Adjust/>, link: "https://tomshen.io/"}
        ]
    }
]


export default function Footprints(prop: Prop) {
    const classes = useStyles(prop)
    const cards = items.map(item =>
        <Card className={classes.root} elevation={3}>
            <CardMedia
                className={classes.media}
                image={item.imageUrl}
                title={item.imageTitle}
            />
            <Box>
                <CardContent>
                    <Typography variant="body2" color="textSecondary">{item.secondary}</Typography>
                    <Typography variant="h5">{item.main}</Typography>
                    <Typography variant="body1">{item.description} </Typography>
                </CardContent>
                <CardActions>
                    {item.actions.map(action => <Button color="primary" className={classes.actionButton}
                                                        startIcon={action.icon} href={action.link}>
                        {action.name}
                    </Button>)}
                </CardActions>
            </Box>
        </Card>
    )
    return <Box>
        <DividerWithText>Footprints</DividerWithText>
        {cards}
    </Box>
}
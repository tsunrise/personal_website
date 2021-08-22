import {Box, Button, Card, CardActions, CardContent, makeStyles, Tooltip, Typography} from "@material-ui/core";

import DividerWithText from "./textDivider";
import {cloneElement} from "react";
import {footprintItems} from "../data/footprintData";

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

export default function Footprints(prop: Prop) {
    const classes = useStyles(prop)
    const cards = footprintItems.map(item =>
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
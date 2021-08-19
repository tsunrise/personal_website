import {createStyles, makeStyles, Theme, Typography} from "@material-ui/core";
import TextLoop from "@johnsdevelop/react-text-loop";

interface Props {}

const useStyles = makeStyles((theme: Theme) => createStyles({
    introContent: {
        fontStyle: `bold`,
        fontSize: 20,
        color: theme.palette.primary.main,
        textAlign: `center`,
        justifyContent: `center`,
        alignItems: `center`,
    },
    fullWidth: {
        width: '100%'
    }
}))

const roles = [
    "a student",
    "a software engineer",
    "a researcher",
    "an open source contributors",
    "an anime lover"
]

export default function Introduction(props: Props){

    const classes = useStyles(props)


    return <Typography className={classes.introContent} align={"center"}>
        I'm <TextLoop children={roles} springConfig={{stiffness: 180, damping: 8}}/>.
    </Typography>

}
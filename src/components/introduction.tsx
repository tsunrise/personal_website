import {createStyles, makeStyles, Theme, Typography} from "@material-ui/core";
import TextLoop from "@johnsdevelop/react-text-loop";
import {introductionRoles} from "../data/introduction_roles";

interface Props {}

const useStyles = makeStyles((theme: Theme) => createStyles({
    introContent: {
        fontStyle: `bold`,
        fontSize: 20,
        color: theme.palette.primary.main,
        textAlign: `center`,
        justifyContent: `center`,
        alignItems: `center`,
        maxWidth: `100%`
    },
    fullWidth: {
        width: '100%'
    }
}))

export default function Introduction(props: Props){

    const classes = useStyles(props)

    return <Typography className={classes.introContent} align={"center"}>
        I'm <TextLoop children={introductionRoles} springConfig={{stiffness: 100, damping: 10}}/>.
    </Typography>

}
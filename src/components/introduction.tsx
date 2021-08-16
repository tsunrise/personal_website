
import {createStyles, makeStyles, Theme} from "@material-ui/core";

interface Props {}

const useStyles = makeStyles((theme: Theme) => createStyles({

}))

export default function Introduction(props: Props){

    const classes = useStyles(props)

    return <div>
        Introduction Placeholder
    </div>
}
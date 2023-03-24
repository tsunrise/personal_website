import { AppBar, alpha, Toolbar, Typography } from "@mui/material";

interface Props {
    isScrollMiddle: boolean
}

export default function HeadBar(props: Props) {

    return <AppBar position="fixed" hidden={false} sx={{
        boxShadow: props.isScrollMiddle ? 3 : 'none',
        background: props.isScrollMiddle ? alpha('#ffffff', 0.7) : "none",
        transition: 'background',
        backdropFilter: props.isScrollMiddle ? "blur(5px)" : "none",
        webkitBackdropFilter: props.isScrollMiddle ? "blur(5px)" : "none",
    }}>
        <Toolbar>
            <Typography variant="h6" sx={{
                color: props.isScrollMiddle ? "black" : "white",
                transition: 'color'
            }}>Tom Shen</Typography>
        </Toolbar>
    </AppBar>
}
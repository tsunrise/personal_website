import { Box, Grid, Typography } from "@mui/material";
import backgroundImg from "../images/bkg.jpg";

export default function Heading() {

    return <Grid item container xs={12} sx={{
        backgroundImage: `linear-gradient(to bottom, rgba(255,255,255,0) 20%,
                rgba(255,255,255,1)), url(${backgroundImg})`,
        backgroundPosition: 'center',
        backgroundSize: 'cover',
        height: 300,
        transition: 'filter',
        transitionDuration: '100ms',
    }} direction="column" alignItems={"center"} justifyContent={"center"}>
        <Grid>
            <Typography variant="h4">Tom Conghao Shen</Typography>
        </Grid>
        <SubHeader content={"Proof of Existence"} />
    </Grid>
}

function SubHeader(prop: { content: string }) {
    return <Box sx={{
        fontFamily: `consolas, San Francisco Mono, Menlo, serif, sans-serif`,
        paddingTop: `5px`
    }}>{prop.content}</Box>
}
//! defines the website layout

import { useEffect, useState } from "react";
import { Box, Divider, Grid, Hidden, Typography } from "@mui/material";
import HeadBar from "./components/headbar";
import Heading from "./components/heading";
import ContactGadget from "./components/contact/contact";
import { styled } from "@mui/system";

const BodyGrid = styled(Grid)(({ theme }) => ({
    [theme.breakpoints.up("sm")]: {
        paddingTop: theme.spacing(4),
    }
}))

const MainItemGrid = styled(Grid)(({ theme }) => ({
    marginTop: 5
}))

export default function MainGrid() {
    const [isMiddle, setIsMiddle] = useState(false);
    // handles the blur level of the heading
    const [headerBlurLevel, setHeaderBlurLevel] = useState(0);

    const handleScroll = () => {
        const threshold = 20;
        setHeaderBlurLevel(Math.min((window.scrollY - threshold) / 7, 10) / 10)
        if (window.scrollY > threshold) {
            setIsMiddle(true)
        } else {
            setIsMiddle(false)
        }
    }

    useEffect(() => {
        window.addEventListener("scroll", handleScroll);
        return () => { window.removeEventListener("scroll", handleScroll) }
    })

    const Placeholder = <Box><Typography variant="h5" sx={{ marginBottom: 2 }}>About Me</Typography>
        <Divider sx={{
            marginTop: 3,
            marginBottom: 2
        }} />
        <Typography variant="body2" color="textSecondary" style={{ marginBottom: 15 }}>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed euismod, nisl vitae
            tincidunt lacinia, nunc nisl aliquam nunc, eget aliquam nisl nisl sit amet
            dolor. Nulla facilisi. Nulla facilisi. Nulla facilisi. Nulla facilisi. Nulla
            facilisi. Nulla facilisi. Nulla facilisi. Nulla facilisi.
        </Typography></Box>

    return (
        <Grid container justifyContent="center" sx={{ flexGrow: 1 }}>

            <HeadBar isScrollMiddle={isMiddle} />

            {/*Global-wide headings, containing image*/}
            <Heading isScrollMiddle={isMiddle} disappearLevel={headerBlurLevel} />

            {/*Page-wide Width Adjustment*/}
            <BodyGrid item container xs={12} sm={11} lg={8} xl={6} spacing={1}>
                <Grid item container xs={12} md={9} direction="column">
                    <MainItemGrid item>
                        <Hidden mdUp>
                            <ContactGadget />
                        </Hidden>
                    </MainItemGrid>

                    {/*Main Content Naive Placeholder*/}
                    <MainItemGrid item>
                        {Placeholder} {Placeholder} {Placeholder} {Placeholder} {Placeholder} {Placeholder}
                    </MainItemGrid>


                    <MainItemGrid item>
                        <Divider sx={{
                            marginTop: 3,
                            marginBottom: 2
                        }} />
                        <Typography variant="body2" color="textSecondary" style={{ marginBottom: 15 }}>
                            © Conghao Shen
                        </Typography>
                    </MainItemGrid>

                </Grid>
                {/*Right Bar: will show contact info (show if screen is large, starting from md)}*/}
                <Grid item container md={3} sx={{
                    display: { xs: 'none', md: 'block' }
                }}>
                    {/*Contact Information*/}
                    <Grid item>
                        <ContactGadget />
                    </Grid>
                </Grid>
            </BodyGrid>

        </Grid>
    )
}
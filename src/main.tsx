//! defines the website layout

import { useEffect, useState } from "react";
import { Box, Divider, Grid, Hidden, Typography } from "@mui/material";
import HeadBar from "./components/headbar";
import Heading from "./components/heading";
import ContactGadget from "./components/contact/contact";
import { styled } from "@mui/system";
import { Salieri } from "./components/salieri/salieri";

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

    return (
        <Grid container justifyContent="center" sx={{ flexGrow: 1 }}>

            <HeadBar isScrollMiddle={isMiddle} />

            {/*Global-wide headings, containing image*/}
            <Heading isScrollMiddle={isMiddle} disappearLevel={headerBlurLevel} />

            {/*Page-wide Width Adjustment*/}
            <BodyGrid item container xs={12} sm={11} lg={8} xl={6} spacing={1}>
                <Grid item container xs={12} md={9} direction="column" sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '65vh', // This ensures the container takes up at least the full viewport height
                    marginLeft: { xs: 1, md: 0 },
                    marginRight: { xs: 1, md: 0 },
                }} justifyContent="space-between">
                    <Grid item container direction="column">
                        <MainItemGrid item>
                            <Hidden mdUp>
                                <ContactGadget />
                            </Hidden>
                        </MainItemGrid>

                        {/*Main Content Naive Placeholder*/}
                        <MainItemGrid item>
                            <Salieri />
                        </MainItemGrid>
                    </Grid>


                    {/* Footnote. There should be blank if content above does not fit one page. */}

                    <MainItemGrid item>
                        <Divider sx={{
                            marginTop: 3,
                            marginBottom: 2
                        }} />
                        <Typography variant="body2" color="textSecondary" style={{ marginBottom: 15 }}>
                            Salieri is a language model, and may display inaccurate or offensive information that doesn't represent Tom's views.
                            <br />
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
            </BodyGrid >

        </Grid >
    )
}
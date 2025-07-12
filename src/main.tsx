//! defines the website layout

import { useEffect, useState } from "react";
import { AppBar, Divider, GridLegacy as Grid, Link, Toolbar, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import Heading from "./components/heading";
import ContactGadget from "./components/contact/contact";
import { styled } from "@mui/system";
import { Salieri } from "./components/salieri/salieri";
import { PrivacyDialog } from "./components/privacy";

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

    const handleScroll = () => {
        const threshold = 20;

        if (window.scrollY > threshold) {
            setIsMiddle(true)
        } else {
            setIsMiddle(false)
        }
    }

    useEffect(() => {
        window.addEventListener("scroll", handleScroll);
        return () => { window.removeEventListener("scroll", handleScroll) }
    }, [])

    return (
        <Grid container justifyContent="center" sx={{ flexGrow: 1 }}>

            <AppBar position="fixed" sx={{
                boxShadow: 3,
                background: alpha('#ffffff', 0.7),
                backdropFilter: "blur(5px)",
                webkitBackdropFilter: "blur(5px)",
                opacity: isMiddle ? 1 : 0,
                visibility: isMiddle ? "visible" : "hidden",
                transition: "opacity 0.1s, visibility 0.1s",
            }}>
                <Toolbar>
                    <Typography variant="h6" sx={{
                        color: "black"
                    }}>Tom Shen</Typography>
                </Toolbar>
            </AppBar>

            {/*Global-wide headings, containing image*/}
            <Heading />

            {/*Page-wide Width Adjustment*/}
            <BodyGrid item container xs={12} sm={11} spacing={1} sx={{
                maxWidth: { xs: '100%', sm: '100%', md: 1000, lg: 1000, xl: 1000 },
            }}>
                <Grid item container xs={12} md={9} direction="column" sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '65vh', // This ensures the container takes up at least the full viewport height
                    marginLeft: { xs: 1, md: 0 },
                    marginRight: { xs: 1, md: 0 },
                }} justifyContent="space-between">
                    <Grid item container direction="column">
                        <MainItemGrid item sx={{ display: { xs: 'block', md: 'none' } }}>
                            <ContactGadget />
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
                            The Salieri System is a language model, and may display inaccurate or offensive information that doesn't represent the real Tom's views. 
                            This site is not affiliated with Cloudflare. 
                            <br />
                            © Conghao Shen | <PrivacyDialog /> | <Link href="https://github.com/tsunrise/personal_website" target="_blank" rel="noreferrer" variant="body2" color="secondary">Source</Link>
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
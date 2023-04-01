import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, Link, Typography } from "@mui/material";
import CloseIcon from '@mui/icons-material/Close';
import { useState } from "react"

const privacyPolicyURL = process.env.PUBLIC_URL + "/privacy.txt"

export const PrivacyDialog = () => {
    const [open, setOpen] = useState(false);
    const [text, setText] = useState<string | null>(null)

    const handleClickOpen = () => {
        setOpen(true);
        (async () => {
            const response = await fetch(privacyPolicyURL);
            const text = await response.text();
            setText(text);
        })();
    }

    const handleClose = () => {
        setOpen(false);
    }

    return <>
        <Link
            sx={{ cursor: "pointer" }}
            variant="body2"
            color="secondary"
            onClick={() => {
                handleClickOpen();
            }}
        >
            Privacy
        </Link>
        <Dialog open={open} onClose={handleClose}>
            <DialogTitle>
                Privacy Policy
                <IconButton
                    onClick={handleClose}
                    sx={{ position: "absolute", right: 8, top: 8, color: (theme) => theme.palette.grey[500] }}
                    aria-label="close"
                >
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent>
                <DialogContentText color="black">
                    <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                        {text}
                    </Typography>
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>Close</Button>
            </DialogActions>
        </Dialog>


    </>
}
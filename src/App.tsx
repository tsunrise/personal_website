import React, {useEffect} from 'react';
import MainGrid from "./components/main";
import '@fontsource/roboto';
import {ThemeProvider} from '@material-ui/styles';
import {createMuiTheme} from "@material-ui/core";
import {grey} from "@material-ui/core/colors";

const theme = createMuiTheme({
    palette: {
        primary: {
            light: `#4f83b5`,
            main: `#155c9e`,
            dark: `#004e96`,
            contrastText: `#fff`
        },
        secondary: {
            light: grey[600],
            main: grey[700],
            dark: grey[800],
            contrastText: `#fff`
        }
    }
})

function App() {
    useEffect(() => {
        console.log("%cWelcome to Tom Shen's Personal Website. \nMy Github: https://github.com/tsunrise",
            `color: white; font-size: 15px`);
        document.title = "Tom Shen"
    }, [])

    return (
        <div className="App">
            <ThemeProvider theme={theme}>
                <MainGrid/>
            </ThemeProvider>
        </div>
  );
}

export default App;

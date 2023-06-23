import { useEffect } from 'react';
import MainGrid from "./main";
import '@fontsource/roboto';
import '@fontsource/source-sans-pro';
import { ThemeProvider } from '@mui/material/styles';
import { createTheme } from '@mui/material/styles';
import { grey } from "@mui/material/colors";

const theme = createTheme({
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
    // document.title = "Tom Shen"
  }, [])

  return (
    <div className="App">
      <ThemeProvider theme={theme}>
        <MainGrid />
      </ThemeProvider>
    </div>
  );
}

export default App;

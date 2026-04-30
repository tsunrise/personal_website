import { useEffect } from 'react';
import MainGrid from "./main";
import { ThemeProvider } from '@mui/material/styles';
import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      light: `#e08e44`,
      main: `#cf7d36`,
      dark: `#8a5228`,
      contrastText: `#02080d`
    },
    secondary: {
      light: `#6f94b3`,
      main: `#506d86`,
      dark: `#314757`,
      contrastText: `#f0dfbd`
    }
  },
  typography: {
    fontFamily: `"Zpix Local", "VT323 Local", "Hiragino Sans", "Yu Gothic", "Microsoft YaHei", "PingFang SC", monospace`,
    button: {
      textTransform: "uppercase"
    }
  },
  shape: {
    borderRadius: 3
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

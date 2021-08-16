import React, {useEffect} from 'react';
import MainGrid from "./components/main";


function App() {
    useEffect(()=>{
        console.log("%cWelcome to Tom Shen's Personal Website. \nMy Github: https://github.com/tsunrise",
            `color: white; font-size: 15px`);
    })

  return (
    <div className="App">
      <MainGrid/>
    </div>
  );
}

export default App;

import { useState } from "react";
import WShelves from "./WShelvesUIComponents/WShelves";
import WShelvesUX from "./WShelvesUIComponents/WShelvesUX";

function WShelvesUI() {

const [uxState,setUXState] = useState("Closed");

function handleUXOpen() {
    if (uxState === "Closed") {
        setUXState("Open")
    } else {setUXState("Closed")}
}

return (<main className={"wShelvesUI ux" + uxState}>
    <WShelvesUX/>
    <button onClick={handleUXOpen}></button>
    <button onClick={handleUXOpen}></button>
    <button onClick={handleUXOpen}></button>
    <WShelves/>



</main>)}
export default WShelvesUI;
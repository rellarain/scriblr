import { useState } from "react";
import WriterShelfUI from "./WriterShelfUI";
import WriterProjectUI from "./WriterProjectUI";

function WriterShelvesUI() {

const [writerShelvesState, setWriterShelvesState] = useState("Closed");

function handleWriterShelvesState() {
    if (writerShelvesState == "Closed") {
        setWriterShelvesState("Open")
    } else {setWriterShelvesState("Closed")}
}


return (<main className={"writerShelvesUI writerShelves" + writerShelvesState}>
    
    <div className="writerShelfStack">
        <WriterShelfUI/>
        <WriterShelfUI/>
        <WriterShelfUI/>
        <WriterShelfUI/>
        <WriterShelfUI/>

    </div>
    <WriterProjectUI/>
    <button className="writerProjectUIToggle" onClick={handleWriterShelvesState}></button>

</main>)}

export default WriterShelvesUI;
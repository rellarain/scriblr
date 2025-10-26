import { useState } from "react";
import ReaderShelfUI from "./ReaderShelfUI";
import ReaderProjectUI from "./ReaderProjectUI";

function ReaderShelvesUI() {

const [readerShelvesState, setReaderShelvesState] = useState("Closed");

function handleReaderShelvesState() {
    if (readerShelvesState == "Closed") {
        setReaderShelvesState("Open");
    } else {setReaderShelvesState("Closed")}
}

return (<main className={"readerShelvesUI readerShelves" + readerShelvesState}>
    <div className="readerShelfStack">
        <ReaderShelfUI/>
        <ReaderShelfUI/>
        <ReaderShelfUI/>
        <ReaderShelfUI/>

    </div>
    <ReaderProjectUI/>
    <button className="readerProjectUIToggle" onClick={handleReaderShelvesState}></button>


</main>)}

export default ReaderShelvesUI;
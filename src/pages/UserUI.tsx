import { useState } from "react";
import ReaderUI from "./ReaderUI";
import WriterUI from "./WriterUI";
import FolderUI from "./FolderUI";
import HelpUI from "../components/HelpUI";

function UserUI() {

    const [screenState, setScreenState]=useState("Home");

    function handleScreenHome() {
        if (screenState !== "Home") {
            setScreenState("Home");
        } else {setScreenState("Home")}
    }

    function handleScreenWriter() {
        if (screenState !== "Writer") {
            setScreenState("Writer")
        } else {setScreenState("Home")}
    }

    function handleScreenReader() {
        if (screenState !== "Reader") {
            setScreenState("Reader")
        } else {setScreenState("Home")}
    }



return (<main className={"userUI screen" + screenState}>
    
    <ReaderUI/>
    <WriterUI/>
    <FolderUI/>
    <HelpUI/>
    <div className="mobileNavBtns">
        <button onClick={handleScreenHome}>Dash</button>
        <button onClick={handleScreenReader}>Reader</button>
        <button onClick={handleScreenWriter}>Writer</button>
        <button onClick={handleScreenHome}>Dash</button>
    </div>

</main>)}
export default UserUI;
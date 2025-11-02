import { useState } from "react";
import ReaderUI from "./ReaderUI";
import WriterUI from "./WriterUI";
import FolderUI from "./FolderUI";
import HelpUI from "../components/HelpUI";
import MobileNavBtns from "../components/UserUIComponents/MobileNavBtns";

function UserUI() {

    const [screenState, setScreenState]=useState("Home");

    function handleScreenHome() {
        if (screenState !== "Home") {
            setScreenState("Home");
        } else {setScreenState("Home")}
    }



return (<main className={"userUI screen" + screenState}>
    
    <ReaderUI/>
    <WriterUI/>
    <FolderUI/>
    <HelpUI/>
    <MobileNavBtns/>

</main>)}
export default UserUI;
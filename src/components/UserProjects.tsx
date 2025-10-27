import { useState } from "react";
import UserHomeUI from "./Home";
import ReaderPagesUI from "./ReaderPagesUI";
import ReaderShelvesUI from "./ReaderShelvesUI";
import WriterShelvesUI from "./WriterShelvesUI";
import WriterBookUI from "./WriterBookUI";

function UserPages() {

    const [toggleReaderShelves, setReaderShelves] = useState("Closed");

    function handleToggleReaderShelves() {
        if (toggleReaderShelves == "Reader") {
            setReaderShelves("Closed")
        } else {setReaderShelves("Reader")}
    }




return (<main className={"userProjectsUI viewing" + toggleReaderShelves}>

    <ReaderPagesUI/>
    <ReaderShelvesUI onButtonClick={handleToggleReaderShelves}/>
    <UserHomeUI/>
    <WriterShelvesUI/>
    <WriterBookUI/>

</main>)}

export default UserPages;
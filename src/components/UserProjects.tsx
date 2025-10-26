import { useState } from "react";
import UserHomeUI from "./Home";
import ReaderPagesUI from "./ReaderPagesUI";
import ReaderShelvesUI from "./ReaderShelvesUI";
import WriterShelvesUI from "./WriterShelvesUI";
import WriterBookUI from "./WriterBookUI";

function UserPages() {





return (<main className={"userProjectsUI open"}>

    <ReaderPagesUI/>
    <ReaderShelvesUI/>
    <UserHomeUI/>
    <WriterShelvesUI/>
    <WriterBookUI/>

</main>)}

export default UserPages;
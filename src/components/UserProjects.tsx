import { useState } from "react";
import UserProject from "./UserProject";
import Admin from "./Admin";


function UserProjects() {

const [userProjectsState, setUserProjectsState] = useState("Home")

function handleWriterProjectOpen() {
    if (userProjectsState === "Home") {
        setUserProjectsState("WriterProject")
    } else {setUserProjectsState("Home")}
}
function handleReaderProjectOpen() {
    if (userProjectsState === "Home") {
        setUserProjectsState("ReaderProject")
    } else {setUserProjectsState("Home")}
}



return (<main className={"userProjectsUI open"+userProjectsState}>
    <section>Account Dashboard</section>
    <section>
        <div onClick={handleReaderProjectOpen}>
            <button></button>
            <button></button>
            <button></button>
            <button></button>
            <button></button>
            <button></button>
        </div>
        <div onClick={handleReaderProjectOpen}>

        </div>
        <div onClick={handleReaderProjectOpen}></div>
        <div>Reader Project Dash</div>
    </section>
    <section>
        <div onClick={handleWriterProjectOpen}>
            <button></button>
            <button></button>
            <button></button>
            <button></button>
            <button></button>
        </div>
        <div onClick={handleWriterProjectOpen}></div>
        <div onClick={handleWriterProjectOpen}></div>
        <div onClick={handleWriterProjectOpen}>
            <button></button>
        </div>
        <div onClick={handleWriterProjectOpen}></div>
        <div>
            <br/>Writer Project Dash (Project Level, Book Level)
            <br/>
            <br/>Project Level: 
            <br/>
            <br/>Book Level: manage details for book, arcs, subarcs; arc and chapter 
        </div>
    </section>
    <Admin/>
</main>)}

export default UserProjects;
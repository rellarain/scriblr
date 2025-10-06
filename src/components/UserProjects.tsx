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
    <Admin/>
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
        <div>
            <br/>Reader Project Dash
            <br/>
            <br/>
            <br/>
            <br/>Alpha Reader Dash: can view outline, draft, and annotations; progress based on outline and draft review with or without flags/notes (unreviewed, updated, reviewed)
            <br/>
            <br/>Beta Reader Dash: can view draft and annotations; progress based on draft review with or without flags/notes (related to structure, content, and/or draft material)
            <br/>
            <br/>Omega Reader Dash: can view draft (formatted or arrayed); progress based on draft review with or without flags/notes (only grammatical, rhetorical, syntactical, commentary; chapter tabs without arcs/subarcs)
            <br/>
        </div>
    </section>
    <section>
        <div onClick={handleWriterProjectOpen}>
            <button></button>
            <button></button>
            <button></button>
            <button></button>
            <button></button>
        </div>
        <div onClick={handleWriterProjectOpen}>drag and droppable books to change order</div>
        <div onClick={handleWriterProjectOpen}></div>
        <div onClick={handleWriterProjectOpen}>
            <button></button>
        </div>
        <div onClick={handleWriterProjectOpen}></div>
        <div>
            <br/>Writer Project Dash (Project Level, Book Level)
            <br/>
            <br/>Project Level: content (plotlines, book sequences), multibook structures (sequels, prequels, trilogies, sagas, duologies), series drafting progress and plan
            <br/>
            <br/>Book Level: manage details for book, arcs, subarcs; plot sequences;
            <br/>
            <br/>Chapter Level: manage details for acts, scenes, moments; manage plot sequences, plotpoints; 
            <br/>
            <br/>Draft Level: manage draft, annotations; 
            <br/>
            <br/>Reader Level: review and revise draft (alpha, beta, omega) 
        </div>
    </section>
</main>)}

export default UserProjects;
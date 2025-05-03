import { useState } from "react";
import Projects from "./PageProjects";
import Structure from "./PageStructure";
import Content from "./PageContent";
import Style from "./PageStyle";
import Draft from "./PageDraft";
import Revise from "./PageRevise";
import Settings from "./PageSettings";



function Interface() {

const [openPage,setOpenPage] = useState("project");

function openProjectScreen() {
    setOpenPage("project");
}
function openStructureScreen() {
    setOpenPage("structure");
}
function openContentScreen() {
    setOpenPage("content");
}
function openStyleScreen() {
    setOpenPage("style");
}
function openDraftScreen() {
    setOpenPage("draft");
}
function openReviseScreen() {
    setOpenPage("revise");
}
function openSettingsScreen() {
    setOpenPage("settings");
}



const [dayNight,setDayNight] = useState(true);

function handleSetDayNight() {
    setDayNight(!dayNight);
}


return (<main className={openPage + "OpenInterface"}>


<Projects/>
<Structure/>
<Content/>
<Style/>
<Draft/>
<Revise/>
<Settings/>
<nav>
    <button onClick={openProjectScreen}><div>PROJECT</div></button>
    <button onClick={openStructureScreen}><div>STRUCTURE</div></button>
    <button onClick={openContentScreen}><div>CONTENT</div></button>
    <button onClick={openStyleScreen}><div>STYLE</div></button>
    <button onClick={openDraftScreen}><div>DRAFT</div></button>
    <button onClick={openReviseScreen}><div>REVISE</div></button>
    <button onClick={openSettingsScreen}><div>SETTINGS</div></button>
    <button onClick={handleSetDayNight}><div></div></button>
</nav>




</main>);}
export default Interface;

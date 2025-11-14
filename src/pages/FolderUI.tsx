import { useState } from "react";

function FolderUI() {



return (<main className="folderUI">
    <nav>
        <FolderTab />
        <FolderTab />
        <FolderTab />
    </nav>
    <main>
        <section></section>
        <section></section>

    </main>


</main>)}
export default FolderUI;


function FolderTab() {
    let tabName = "Dash"

    return (<div className="folderTab">

    <div></div>
    <div></div>
    <button>{tabName}</button>
    <div></div>
    <div></div>

</div>)}
import { useState } from "react";


function UserProject() {






return (<main className="userProjectUI">
    <ul>
        <li>USER PROJECT / Dashboard (Bookshelf)</li>
        <li>Dashboard: checklist/schedule, phase progress & access (outline, draft, revise, reviewers), project settings</li>
        <li>
            Outline: structure (CRUdN; sagas, trilogies, duologies, books, arcs, subarcs, chapters, acts, scenes, moments, ), 
            content (plot filters, add content, update content, delete with PIN, )
        </li>
    </ul>
    <ul>
        <li>User Project / Outline (Book/Cover)</li>
        <li>wide book cover interface with tabs</li>
        <li>Project/Shelf Level: STRUCTURAL (view books, new book, edit book details, edit book order), CONTENT (plot category, plot subcategory, plotline, book plot sequence)</li>
        <li>Book/Cover Level: STRUCTURAL (view arcs/subarcs, new arc/subarc, edit arc/subarc details, edit arc/subarc order, delete arc/subarc with password, chapter link tabs, view chapters, new chapter, edit chapter details, edit chapter order, delete chapter with password), CONTENT (arc plot sequence, subarc plot sequence, chapter plot sequence)</li>
        <li>Chapter/Tab Level: STRUCTURAL`` (view acts, new act, edit act description, edit act order, delete act, view scenes, new scene, edit scene description, edit scene order, delete scene, view moments, new moment, edit moment description, edit moment order, delete moment), CONTENT (act plot sequence, scene plot sequence, moment plotpoints)</li>
    </ul>
    <ul>
        <li>User Project / Draft (Tabs)</li>
        <li>edge of the book cover on the left, wide paper interface for chapter with tab on the right</li>
    </ul>
    <ul>
        <li>User Project / Revision (Pages) </li>
        <li>formatted copy either in page or scroll mode, flag/note interface when selecting sentences</li>
    </ul>
    <ul>
        <li>User Project / Readers</li>
        <li>Group Level: total progress, reader cards with progress indicators</li>
        <li>Tier Level: tier progress, </li>
        <li>Reader Level: </li>
    </ul>

</main>)}


export default UserProject;

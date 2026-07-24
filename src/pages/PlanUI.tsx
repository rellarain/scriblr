import { useState } from "react"

function PlanUI() {

    const [planState,setPlanState] = useState<boolean>(true);

    function handlePlanState() {
        if (planState === true) {
            return setPlanState(false)
        } else { return setPlanState(true)}
    }

    return(

        <div className={planState ? 'planUI planActive' : 'planUI planInactive'}>
            <button className="planToggle" onClick={handlePlanState}>Plan</button>
            <div className={'planContent'}>
                <h3>Visitor UI</h3>
                <p>Description</p>
                <h3>User UI</h3>
                <h3>Training UI</h3>
                <ul>
                    <p><b>User Tools</b></p>
                    <li><b>Account</b>:</li>
                    <li><b>Dash</b>:</li>
                </ul>
                <ul>
                    <p><b>Reader Tools</b></p>
                    <li><b>Library</b>:</li>
                    <li><b></b>:</li>
                </ul>
                <ul>
                    <p><b>Writer Tools</b></p>
                    <li><b>Project Tool</b>:</li>
                    <li><b>Content Tool</b>:</li>
                    <li><b>Outline Tool</b>:</li>
                    <li><b>Drafting Tool</b>:</li>
                    <li><b>Revision Tool</b>:</li>
                </ul>
                <ul>
                    <p><b>Basic Admin Tools</b></p>
                    <li><b>Help Desk Tools</b>:</li>
                    <li><b>Feedback Tools</b>:</li>
                </ul>
                <ul>
                    <p><b>Intermediate Admin Tools</b></p>
                    <li><b>Writer Admin</b>:</li>
                    <li><b>Reader Admin</b>:</li>
                    <li><b>User Admin</b>:</li>
                </ul>
                <ul>
                    <p><b>Advanced Admin Tools</b></p>
                    <li><b>Lead Admin</b>:</li>
                </ul>
                <h3>Reader UI</h3>
                <ul>
                    <p><b>Library</b> Reader Dashboard</p>
                </ul>
                <ul>
                    <p><b>Shelves</b> Genres, Authors</p>
                </ul>
                <ul>
                    <p><b>Shelf</b> Series Page</p>
                </ul>
                <ul>
                    <p><b>Book</b> Book Page</p>
                </ul>
                <ul>
                    <p><b>Pages</b> Reader UI</p>
                </ul>

                <h3>Writer UI</h3>
                <ul>
                    <p><b>Shelves</b> Writer Dashboard</p>
                    <p>Manage all writing projects</p>
                    <li><b>Calendar</b> (All Projects):</li>
                    <li><b>Schedule</b> (All Projects):</li>
                    <li><b>Progress</b> (All Projects):</li>
                    <li><b></b>:</li>
                </ul>
                <ul>
                    <p><b>Shelf</b> Project Lvl Outline</p>
                    <li><b>Project Schedule</b>: goals ()</li>
                    <li><b>Categories</b>:</li>
                    <li><b>Subcategories</b>:</li>
                    <li><b>Plotlines</b>:</li>
                    <li><b>Plot Sequence Creator</b>:</li>
                    <li><b>Plotpoint Creator</b>:</li>
                    <li><b>Content Templates</b>:</li>
                    <li><b>Series Outlines</b>:</li>
                    <li><b>Book Mgmt</b>:</li>
                    <li><b>Book Templates</b>:</li>
                </ul>
                <ul>
                    <p><b>Book</b> Book Lvl Outline</p>
                    <li><b>Book Outline</b>: </li>
                    <li><b>Chapter Mgmt</b>: add/delete chapters</li>
                    <li><b>Arc Outlines</b>:</li>
                    <li><b>Subarc Outlines</b>:</li>
                    <li><b>Plot Sequence Creator</b>:</li>
                    <li><b>Plotpoint Creator</b>:</li>
                </ul>
                <ul>
                    <p><b>Page</b> Chapter Lvl Outline</p>
                    <li><b>Chapter Outline</b>:</li>
                    <li><b>Act Outlines</b>:</li>
                    <li><b>Scene Outlines</b>:</li>
                    <li><b>Moment Outlines</b>:</li>
                    <li><b>Plot Sequence Creator</b>:</li>
                    <li><b>Plotpoint Creator</b>:</li>
                    <li><b>Draft Editor</b>:</li>
                </ul>
                <ul>
                    <p><b>Pages</b> Chapter Reader</p>
                    <li><b></b>:</li>
                </ul>

                <h3>Admin UI</h3>
                <ul>
                    <p><b>Help Desk</b> Support Chat</p>
                    <li><b></b>:</li>
                </ul>
                <ul>
                    <p><b>General Admin</b> Tier 1</p>
                    <p>Channel and annotate feedback to relevant admin teams.</p>
                    <li><b>Sort</b>: page (UUI, AUI, RUI, WUI, VUI), feature, content, tone (pleasant, unpleasant, mixed, neutral)</li>
                    <li><b>Explicate</b>: BREAD verb (browse, read, edit, add, delete), subject (page, feature, content) </li>
                    <li><b>Help Desk</b>: primary support for general users and visitors</li>
                </ul>
                <ul>
                    <p><b>Reader Admin</b> Tier 2</p>
                    <p>Support readers and implement ReaderUI action/feedback items.</p>
                    <li><b>Reader Mgmt</b>: </li>
                    <li><b>Reactions</b>: </li>
                    <li><b>Flags</b>: </li>
                    <li><b>Tags</b>: </li>
                    <li><b>Journal</b>: </li>
                    <li><b>Genres</b>: </li>
                    <li><b>Moderating Forums</b>: </li>
                    <li><b>Help Desk</b>: primary support for reader users, backup support for general users and visitors</li>
                </ul>
                <ul>
                    <p><b>Writer Admin</b> Tier 2</p>
                    <p>Support writers and implement WriterUI action/feedback items.</p>
                    <li><b>Writer Mgmt</b>: </li>
                    <li><b>Project Tool Mgmt</b>: </li>
                    <li><b>Content Tool Mgmt</b>: </li>
                    <li><b>Outline Tool Mgmt</b>: </li>
                    <li><b>Drafting Tool Mgmt</b>: </li>
                    <li><b>Revision Tool Mgmt</b>: </li>
                    <li><b>Help Desk</b>: primary support for writer users, backup support for general users and visitors</li>
                </ul>
                <ul>
                    <p><b>User Admin</b> Tier 3</p>
                    <p>Support Tier 2 admin and implement UUI/VUI/WUI/RUI action items.</p>
                    <li><b>User Mgmt</b>: </li>
                    <li><b></b>: </li>
                    <li><b>User Training Mgmt</b>: </li>
                    <li><b>Writer Training Mgmt</b>: </li>
                    <li><b>Reader Training Mgmt</b>: </li>
                    <li><b>Help Desk</b>: primary support for general, writer, and reader admin; backup support for writer and reader users</li>
                </ul>
                <ul>
                    <p><b>Lead Admin</b> Tier 4</p>
                    <p>Support Tier 3 admin and implement VUI/UUI/WUI/RUI/TUI/AUI action items </p>
                    <li><b>Integrate Feedback</b>: channel BREAD statements into project plan and task/action items for admin</li>
                    <li><b>Revenue Mgmt</b>: </li>
                    <li><b>Team Mgmt</b>: performance (),</li>
                    <li><b>Admin Mgmt</b>: </li>
                    <li><b>Admin Training Mgmt</b>: </li>
                    <li><b>Credit/Payment Mgmt</b>: </li>
                    <li><b>Help Desk</b>: primary support for lead and user admin; backup support for general, writer, and reader admin</li>
                </ul>
            </div>
            

        </div>

    )
}


export default PlanUI
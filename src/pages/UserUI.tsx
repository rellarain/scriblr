import { useState } from "react";
import useWindowDimensions from "../functionality/viewport";
import UserNav from "../assets/components/uUI/userNav";
import UserSchedule from "../assets/components/uUI/userSchedule";
import TrainingUI from "../assets/components/uUI/TrainingUI";
import HelpUI from "../assets/components/uUI/HelpUI";
import DashUI from "../assets/components/uUI/DashUI";
import AdminUI from "./AdminUI";
import WriterUI from "./WriterUI";
import ReaderUI from "./ReaderUI";


function UserUI() {

    const {viewportWidth, viewportHeight} = useWindowDimensions();

    let screenIntervals = 360;

    let screenColumns : number = viewportWidth / screenIntervals;
    let screenRows : number = viewportHeight / screenIntervals;

    let screenColumnsRnd : number = Math.floor(screenColumns);
    let screenRowsRnd : number = Math.floor(screenRows);

    let screenOrientation;
    if (viewportHeight > viewportWidth) {
        screenOrientation = "Portrait";
    } else {screenOrientation = "Landscape";}






return (<main className={"userUI screen" + screenOrientation+" screen"+screenRowsRnd+'x'+screenColumnsRnd}>

    <AdminUI/>
    <WriterUI/>
    <ReaderUI/>
    <header className="userHeader">
        <TrainingUI/>
        <HelpUI/>
        <UserSchedule/>
        <DashUI/>
        <UserNav/>
    </header>



</main>)}
export default UserUI;
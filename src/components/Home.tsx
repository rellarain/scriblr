import { useState } from "react";
import UserDashUI from "./Dash";
import UserTrainingUI from "./Training";
import Admin from "./Admin";

function UserHomeUI() {



return (<main className="userHome">
    Home

    <UserDashUI/>
    <UserTrainingUI/>
    <Admin/>


</main>)}

export default UserHomeUI;
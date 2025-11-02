import { useState } from "react";
import Login from "./Login";
import Register from "./Register";


function Landing() {






return (<main className="landingPage">
    Landing: 
    <ul>
        <li>LANDING PAGE</li>
        <li>welcome screen for all users</li>
        <li>
            DESIGN: 
            <br/> - 
            <br/> - 
            <br/> - 
            <br/> - 
            <br/> - 
        </li>
        <li>Welcome: welcome message, Scriblr news, </li>
        <li>Beta Reader Listings: genre/subgenre, age group, proofreaders </li>
        <li>Reader Services: beta reading, reader certs</li>
        <li>Writer Services: </li>
        <li>Scriblr Stats: </li>
        <li></li>
        <li></li>
    </ul>

    <Register/>
    <Login/>
</main>)}


export default Landing;

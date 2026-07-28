import React, { useEffect, useState } from "react";
import useWindowDimensions from "../../../functionality/viewport";
import SkyScene from "./skyScene";


interface UIProps {
    time: Date
    setTime: React.Dispatch<React.SetStateAction<Date>>
}



function UserNav({time, setTime}:UIProps) {
    const {viewportWidth, viewportHeight} = useWindowDimensions();
    
    let nowHour : number = time.getHours();
    let nowMins : number = time.getMinutes();
    let timeStamp : string = (time.getHours()%12).toString().padStart(2,'0')+":"+time.getMinutes().toString().padStart(2,'0');
    
    
    
    const [initialPhase,setInitialPhase] =useState<string>('Night')
    
    function handleInitialPhase(nowHour : number) {
        let x = nowHour;
        if (0 <= x && x < 4) {
            return setInitialPhase('Night');
        } else if (4 <= x && x < 8) {
            return setInitialPhase('Dawn');
        } else if (8 <= x && x < 12) {
            return setInitialPhase('Morning');
        } else if (12 <= x && x < 16) {
            return setInitialPhase('Noon');
        } else if (16 <= x && x < 20) {
            return setInitialPhase('Afternoon');
        } else {
            return setInitialPhase('Dusk');
        }
    }
    
    
    const [currentPhase,setCurrentPhase] = useState<string>(initialPhase)
    
    function handlePhaseToggle() {
        if (currentPhase === 'Night') {
            setCurrentPhase('Dawn')
        } else if (currentPhase === 'Dawn') {
            setCurrentPhase('Morning')
        } else if (currentPhase === 'Morning') {
            setCurrentPhase('Noon')
        } else if (currentPhase === 'Noon') {
            setCurrentPhase('Afternoon')
        } else if (currentPhase === 'Afternoon') {
            setCurrentPhase('Dusk')
        } else if (currentPhase === 'Dusk') {
            setCurrentPhase('Night')
        }
        console.log(currentPhase)
    }
    function handlePhaseReset() {
        setCurrentPhase(initialPhase);
        console.log(currentPhase)
    }
    
    // useEffect(() => {
    //     window.addEventListener('load', handleInitialPhase(nowHour));
    //     return () => {window.removeEventListener('load', handleInitialPhase)}
    // },[]);



    function PhaseToggle() {

        

        return(

            <div className={'phaseToggle'}>
                <button onClick={handlePhaseReset}>
                    {timeStamp}
                </button>
                <button onClick={handlePhaseToggle}>
                    <div>{currentPhase}</div>
                </button>
                <SkyScene time = {time} setTime={setTime}/>

                {/* 
                    Night: , 
                    Dawn: 4 <= X && X < 8
                    Morning: 8 <= X && X < 12
                    Noon: 12 <= X && X < 16
                    Afternoon: 16 <= X && X < 20
                    Evening: 20 <= X
                */}

            </div>

        )
    }




    

    return(

        <div className={'userNav'}>
            Nav: user info, pagination/UI selection, toggles, search, {Math.floor(viewportHeight/360)+"rows : "+Math.floor(viewportWidth/360)+"columns --- "+timeStamp}
            <PhaseToggle/>
        </div>

    )
}


export default UserNav
import { useEffect } from "react";

interface TimeProps {
    time: Date
    setTime: React.Dispatch<React.SetStateAction<Date>>
}



function SkyScene({time, setTime}:TimeProps) {

    let hour : number = time.getHours();
    let minute : number = time.getMinutes();
    let milliseconds : number = time.getMilliseconds();
    let remMilliseconds : number = 1000 - milliseconds;

    useEffect(() => {
        const intervalID = setInterval(() => {
            setTime(new Date());
        }, remMilliseconds);

        return () => {
            clearInterval(intervalID);
        }
    },[]);

    return(

        <div className={'skyScene'}>
            sky scene {hour+":"+minute}
        </div>

    )
}


export default SkyScene
import React, { useState } from "react";

interface ScheduleData {
    startGap: number,
    activityLog: number[],
    time: Date,
    endGap: number
}



function UserSchedule() {

    // ----------------------------------------------------------------------------
    // Time Object
    // ----------------------------------------------------------------------------

    let time : Date = new Date();
    let hour24 : number = time.getHours();
    let hour12 : number = hour24 % 12 === 0 ? 12 : hour24 % 12;
    let minutes : string = time.getMinutes().toString().padStart(2,'0');
    let timeStamp : string = hour12+":"+minutes;

    // ----------------------------------------------------------------------------
    // Activity Log
    // ----------------------------------------------------------------------------
    
    const [activityLog,setActivityLog] = useState<(number)[]>(
        [2,2,2,20,0,0,0,0,2,2,2,2,20,5,4,8,86,4,526,541,45,556,5,4,65,635]
    )
    let schedPassedInts : number = (time.getHours() * 4) + (Math.floor(time.getMinutes()/15));
    let totalActiveInts : number = activityLog.length;
    let schedRemainInts : number = 96 - schedPassedInts
    
    let schedActivityTotal : number = 0;
    for (let i = 0; i < totalActiveInts; i++) {
        schedActivityTotal += activityLog[i];
    }
    const [averageActivity, setAverageActivity] = useState<number>(schedActivityTotal/totalActiveInts)


    let startGap : number =  schedPassedInts - totalActiveInts;



    let endGap = schedRemainInts;
    



    

    // ----------------------------------------------------------------------------
    // Sub-Components for UserSchedule
    // ----------------------------------------------------------------------------


    function ScheduleStartGap(){
        let newStartGap : number = startGap + totalActiveInts;
        let clockStyling: React.CSSProperties = {
            width: startGap.toString() + "%"
        }
        return(

            <div className={'schedGap'} style={clockStyling}>
                {startGap}
            </div>

        )
    }

    function ActivityLog() {
        let activityLogLength : React.CSSProperties = {
            width: totalActiveInts.toString()+"%"
        } 
        let digitCommas : RegExp = /\B(?=(\d{3})+(?!\d))/g;

        return(
            <div className={'activityLogIntervals'} style={activityLogLength}>
                {totalActiveInts} 
            </div>
        )
    }


    function ScheduleClock() {

        return(
            <div className={'schedClock'}>
                {timeStamp}
            </div>
        )
    }


    function ScheduleEndGap(){
        let ClockStyling: React.CSSProperties = {
            width: (endGap) + "%"
        }
        return(
            <div className={'schedGap'} style={ClockStyling}>
                {endGap}
            </div>
        )
    }




    return(
        <div className={'userSchedule'}>
            <ScheduleStartGap/>
            <ActivityLog/>
            <ScheduleClock/>
            <ScheduleEndGap/>


            {/* Sub-Components:
                - Time Offset: expands to the number of missed intervals today (15min=1% wide)
                - Activity Tracker: (15min=1% wide)
                    - Inactivity: no actions submitted by user 
                    - User Activity: non-work actions submitted by user (5px = less than ave, 10px = average, 15px = more than ave)
                    - Admin Activity: work actions submitted by user (5px = less than ave, 10px = average, 15px = more than ave)
                - Clock: (4% wide, 15px)
            */}

        </div>
    )
}





export default UserSchedule
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
    let timeStamp : string = time.getHours() % 12+":"+time.getMinutes().toString().padStart(2,'0');


    // ----------------------------------------------------------------------------
    // Activity Log
    // ----------------------------------------------------------------------------
    

    const [activityLog,setActivityLog] = useState<(number | string)[]>(
        [0,1,2,5,41,8,46,58,45,5,4,54,56412,2,51,52,6,5,5,5,5]
    )

    let startGap = ((time.getHours()*4)-Math.floor((time.getMinutes()/15)))
    let endGap = (96 - time.getHours()*4 - Math.ceil(time.getMinutes()/15));
    



    

    // ----------------------------------------------------------------------------
    // Sub-Components for UserSchedule
    // ----------------------------------------------------------------------------

    function ActivityLog() {
        
        let activityLogLength : React.CSSProperties = {
            width: activityLog.length.toString()+"%"
        } 
        
        return(
    
            <div className={''} style={activityLogLength}>
                {activityLog.length}
            </div>
    
        )
    }

    function ScheduleInterval() {
        
        
        
        let logStyling: React.CSSProperties = {
            width: activityLog.length.toString()+"%" 
        }
        

        return(

            <div className={'schedInterval'} style={logStyling}>
                
            </div>

        )
    }

    function ScheduleClock() {

    



        return(

            <div className={'schedClock'}>
                
            </div>

        )
    }

    function ScheduleStartGap(){


        let clockStyling: React.CSSProperties = {
            width: (startGap - activityLog.length) + "%"
        }


        return(

            <div className={'schedGap'} style={clockStyling}>
                {startGap}
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
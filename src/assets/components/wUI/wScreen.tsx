import { useState } from "react"

function WScreen() {



    const [userState,setUserState] = useState<string>('Admin');
    const [adminState,setAdminState] = useState<string>('Open')
    const [interfaceState,setInterfaceState] = useState<string>('Interface')
    // Account, Interface, Dash
    const [pageState,setPageState] = useState<string>('Dash')

    function openAccount() {
        if (interfaceState !== 'Account') {
            setInterfaceState('Account');
        } else {setInterfaceState('Dash')}
    } 
    function openInterface() {
        if (interfaceState !== 'Interface') {
            setInterfaceState('Interface');
        } else {setInterfaceState('Dash')}
    } 
    function openAdmin() {
        if (adminState !== 'Open') {
            setAdminState('Open')
        } else {setAdminState('Closed')}
    }


    // ----------------------------------------------------------------------------
    // COMPONENT STRUCTURE
    // ----------------------------------------------------------------------------



    // ----------------------------------------------------------------------------
    // PAGE STRUCTURE
    // ----------------------------------------------------------------------------
    

    return(

        <div className={'wScreen'}>
            <div className={'testUI open'+interfaceState+' admin'+adminState+' page'+pageState}>
                <div className="testUser">
                    <div className="testAccount">
                        <nav>
                            <button onClick={openAccount}>account</button>
                            <button onClick={openInterface}>VUI</button>
                            <button onClick={openInterface}>UUI</button>
                            <button onClick={openInterface}>RUI</button>
                            <button onClick={openInterface}>WUI</button>
                            <button onClick={openInterface}>TUI</button>
                            <button onClick={openInterface}>AUI</button>
                            <button>dash</button>
                        </nav>
                    </div>
                    <div className="testDash">Dash: schedule/activityLog/history, feed/notifications/updates/news</div>
                    <div className="testInterfaces">
                        <div className="testVUI">VUI: welcome interface, all users</div>
                        <div className="testUUI">UUI: social interface, registered users</div>
                        <div className="testTUI">TUI: training interface, registered users</div>
                        <div className="testRUI">RUI: reading interface, reader & admin users</div>
                        <div className="testWUI">WUI: writing interface, writer & admin users</div>
                        <div className="testAUI">AUI: administrative interface, only authorized users</div>
                    </div>
                </div>
                <div className="testAdmin">
                    Admin
                    <div className="testChats">
                        <button className='testChatQueues' onClick={openAdmin}>AUI</button>
                        <Chat/>
                        <Chat/>
                        <Chat/>
                        <Chat/>
                        <Chat/>
                    </div>
                </div>
                <div></div>

            </div>
        </div>

    )
}


    function Chat() {
        
        const [chatActivity,setChatActivity]=useState<string>('chatInactive');
        function openChat() {
            if (chatActivity !== 'chatActive') {
                return setChatActivity('chatActive')
            } else {return setChatActivity('chatInactive')}
        }
    
        return(
    
            <button className={'testChat '+chatActivity} onClick={openChat}>
                +
            </button>
    
        )
    }


 export default WScreen
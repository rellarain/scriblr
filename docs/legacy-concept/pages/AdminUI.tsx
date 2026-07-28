import { useState } from "react"

function AdminUI() {

    const [chatState,setChatState] = useState<number>(0);



    function AdminTabs() {
    
    
        return(
    
            <div className={'adminTabs'}>
                <button>Lead <b>40</b></button>
                <button>User <b>150</b></button>
                <button>Writer <b>351</b></button>
                <button>Reader <b>2,138</b></button>
                <button>Feedback <b>20,138</b></button>
                <button>Break <b>X</b></button>
            </div>
    
        )
    }




    function AdminDeskTool() {
    
    
        return(
    
            <div className={'adminDeskTool'}>
                desk
            </div>
    
        )
    }



    function AdminChatTool() {
    
    
        return(
    
            <div className={'adminChatTool'}>
                {chatState}
            </div>
    
        )
    }

    return(

        <main className={'adminUI '+chatState}>
            {/* AdminUI: reader admin, writer admin, user admin, lead admin */}
            <AdminTabs/>
            <AdminChatTool/>
            <AdminDeskTool/>

            {/* 
                Feedback Desk: queue stack, simple UI, in-line/bulk sorting
                    - Explicate: breaking feedback into BREAD statements w/ feature/element
                    - Integrate: channel BREAD statements into project plan and task/action items
                Reader Desk: processing task/action items on ReaderUI configuration
                    - Reactions: 
                    - Flags: 
                    - Genres:
                    - Forums:
                Writer Desk: processing task/action items on WriterUI configuration
                    - Analytics: 
                    - Presets: categories, subcategories
                    - Templates: 
                User Desk: processing task/action items on UserUI and VisitorUI configuration
                    - Marketing:
                    - 
                    - 
                    - 
                    - 
                    - 
                    - 
                Admin Desk: processing task/action items on AdminUI configuration
                    - 
            */}
            
        </main>

    )
}



export default AdminUI
import { useState, Fragment } from "react"
import WScreen from "./wScreen"
import WShelf from "./wShelf"

function WShelves() {

    const [shelvesSize,setShelvesSize] = useState<string>('Max');

    function toggleShelvesSize() {
        if (shelvesSize === 'Max') {
            setShelvesSize('Min');
        } else {setShelvesSize('Max')}
    }

    return(

        <div className={'wShelves shelves'+shelvesSize}>
            <div className="shelvesContainer">
                <WShelf/>
                <WShelf/>

            </div>
            
            <WScreen/>
            
            <button onClick={toggleShelvesSize} className="shelvesBtn">{shelvesSize === "Max" ? "-" : "+"}</button>
        </div>

    )
}


 export default WShelves
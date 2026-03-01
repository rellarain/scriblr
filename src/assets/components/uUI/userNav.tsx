import useWindowDimensions from "../../../functionality/viewport";

function UserNav() {

    const {viewportWidth, viewportHeight} = useWindowDimensions();

    let time:Date= new Date();
    let timeStamp : string = (time.getHours()%12).toString().padStart(2,'0')+":"+time.getMinutes().toString().padStart(2,'0');

    return(

        <div className={'userNav'}>
            Nav: user info, pagination/UI selection, toggles, search, {viewportHeight+"px : "+viewportWidth+"px --- "+timeStamp}
        </div>

    )
}


 export default UserNav
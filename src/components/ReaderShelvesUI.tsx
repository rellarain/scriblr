import { PropsWithChildren, PropsWithoutRef, useState } from "react";
import ReaderShelfUI from "./ReaderShelfUI";
import ReaderProjectUI from "./ReaderProjectUI";

 interface ReaderShelvesProps {
    onButtonClick: () => void;
 }

 type onButtonClick = {
    onButtonClick: () => void
 }

function ReaderShelvesUI({ onButtonClick }: onButtonClick) {




return (<main className={"readerShelvesUI"}>
    <div className="readerShelfStack">
        <ReaderShelfUI/>
        <ReaderShelfUI/>
        <ReaderShelfUI/>
        <ReaderShelfUI/>

    </div>
    <ReaderProjectUI/>
    <button className="readerProjectUIToggle" onClick={onButtonClick}></button>


</main>)}

export default ReaderShelvesUI;
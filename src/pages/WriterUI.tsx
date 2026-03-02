import React, { useState } from "react";

function WriterUI() {

    let fakeDraft : string ='Here is a 600-word Lorem Ipsum passage with standard punctuation. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Curabitur pretium tincidunt lacus. Nulla gravida orci a odio. Nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris. Integer in mauris eu nibh euismod gravida. Duis ac tellus et risus vulputate vehicula. Donec lobortis risus a elit. Etiam tempor. Ut ullamcorper, ligula ea tempor congue, eros est euismod turpis, id tincidunt sapien risus a quam. Maecenas fermentum consequat mi. Donec fermentum, pede vel gravida placerat, libero dui cursus elit, sed auctor urna neque at nisi. Fusce aliquam, tellus sit amet porta convallis, massa ligula sollicitudin elit, sed facilisis metus lorem ac justo. Nam convallis elementum purus. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Donec sodales sagittis magna. Sed consequat, leo eget bibendum sodales, augue velit cursus nunc, quis gravida magna mi a libero. Fusce lacinia arcu et nulla. Nulla vitae massa dictum nisl the scelerisque elementum. Etiam sed augue non urna lacinia the convallis. Nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris. Integer in mauris eu nibh euismod gravida. Duis ac tellus et risus vulputate vehicula. Donec lobortis risus a elit. Etiam tempor. Ut ullamcorper, ligula ea tempor congue, eros est euismod turpis, id tincidunt sapien risus a quam. Maecenas fermentum consequat mi. Donec fermentum, pede vel gravida placerat, libero dui cursus elit, sed auctor urna neque at nisi. Phasellus a felis. In hac habitasse platea dictumst. Vestibulum tristique, turpis in scelerisque vulputate, nunc metus scelerisque nunc, a interdum magna augue id purus. Aenean sodales, felis in sollicitudin congue, magna erat condimentum ante, in iaculis libero nisl nec erat. Vestibulum sed sem. Nunc at mi. Nulla neque. Suspendisse potenti. Donec at sem. Curabitur sollicitudin, nunc in scelerisque facilisis, purus diam pharetra urna, id interdum felis ante a arcu. Proin id erat. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Donec sodales sagittis magna. Sed consequat, leo eget bibendum sodales, augue velit cursus nunc, quis gravida magna mi a libero. Fusce lacinia arcu et nulla. Nulla vitae massa dictum nisl the scelerisque elementum. Etiam sed augue non urna lacinia the convallis. Nam nec ante. Sed lacinia, urna non tincidunt mattis, tortor neque adipiscing diam, a cursus ipsum ante quis turpis. Nulla facilisi. Ut fringilla. Suspendisse potenti. Nunc feugiat mi a tellus consequat imperdiet. Vestibulum sapien. Proin quam. Etiam ultrices. Suspendisse in justo eu magna luctus sodales. Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Aenean commodo ligula eget dolor. Aenean massa. Cum sociis natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Donec quam felis, ultricies nec, pellentesque eu, pretium quis, sem. Nulla consequat massa quis enim. Donec pede justo, fringilla vel, aliquet nec, vulputate eget, arcu. In enim justo, rhoncus ut, imperdiet a, venenatis vitae, justo. Nullam dictum felis eu pede mollis pretium. Integer tincidunt. Cras dapibus. Vivamus elementum semper nisi. Aenean vulputate eleifend tellus. Aenean leo ligula, porttitor eu, consequat vitae, eleifend ac, enim. Aliquam lorem ante, dapibus in, viverra quis, feugiat a, tellus. Phasellus viverra nulla ut metus varius laoreet. Quisque rutrum. Aenean imperdiet. Etiam ultricies nisi vel augue. Curabitur ullamcorper ultricies nisi. Nam eget dui. Etiam rhoncus. Maecenas tempus, tellus eget condimentum rhoncus, sem quam semper libero, sit amet adipiscing sem neque sed ipsum. Nam quam nunc, blandit vel, luctus pulvinar, hendrerit id, lorem. Maecenas nec odio et ante tincidunt tempus. Donec vitae sapien ut libero venenatis faucibus. Nullam quis ante. Etiam sit amet orci eget eros faucibus tincidunt. Duis leo. Sed fringilla mauris sit amet nibh. Donec sodales sagittis magna.';

    let sentences : RegExp = /[\.]/g;

    let lineBreak : string = ".\n\n "

return (<main className="writerUI">
    WriterUI:
    <br/>
    <br/>
    <br/>
    <br/> WShelves: shelves/all projects, shelf/project, stack/series
    <br/> WBook: cover/book, pages/chapter
    <br/>
    <br/>
    <br/>
    <p>
        {/* {fakeDraft.split(sentences).join(lineBreak)} */}

    </p>
    <div></div>

</main>)}
export default WriterUI;
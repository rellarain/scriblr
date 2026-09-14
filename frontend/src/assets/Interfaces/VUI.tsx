import type { ReactNode } from 'react'

function VUI({ children }: { children?: ReactNode }) {


    return(

        <main className={'vUI'}>
            {children}
            VUI
        </main>

    )
}


export default VUI

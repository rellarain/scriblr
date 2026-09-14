import type { ReactNode } from 'react'

function RUI({ children }: { children?: ReactNode }) {


    return(

        <main className={'rUI'}>
            {children}
            RUI
        </main>

    )
}


export default RUI
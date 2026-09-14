import type { ReactNode } from 'react'

function TUI({ children }: { children?: ReactNode }) {


    return(

        <main className={'tUI'}>
            {children}
            TUI
        </main>

    )
}


export default TUI

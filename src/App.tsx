import React from 'react'
import { useState, Fragment } from 'react'
import ReactDOM from 'react-dom/client'
import Interface from './components/Interface'
import './style.css'


ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <Interface/>
    </React.StrictMode>,
)
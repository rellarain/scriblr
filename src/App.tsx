import React from 'react'
import { useState, Fragment } from 'react'
import ReactDOM from 'react-dom/client'
import './style/style.css'
import VisitorUI from './pages/VisitorUI'
import UserUI from './pages/UserUI'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <VisitorUI/>
    <UserUI/>
  </React.StrictMode>
)
import React from 'react'
import { useState, Fragment } from 'react'
import ReactDOM from 'react-dom/client'
import './style/style.css'
import Landing from './components/Landing'
import UserPages from './components/UserProjects'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Landing/>
    <UserPages/>
  </React.StrictMode>
)
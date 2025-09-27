import React from 'react'
import { useState, Fragment } from 'react'
import ReactDOM from 'react-dom/client'
import './style/style.css'
import Landing from './components/Landing'
import Register from './components/Register'
import Login from './components/Login'
import Admin from './components/Admin'
import UserProjects from './components/UserProjects'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Landing/>
    <UserProjects/>
    <Admin/>
  </React.StrictMode>
)
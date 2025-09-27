import React from 'react'
import { useState, Fragment } from 'react'
import ReactDOM from 'react-dom/client'
import Interface from './components/Interface'
import './style/style.css'
import Landing from './components/Landing'
import Register from './components/Register'
import UserProjects from './components/UserProjects'
import Login from './components/Login'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Interface/>
    <Landing/>
    <Register/>
    <UserProjects/>
    <Login/>
  </React.StrictMode>
)
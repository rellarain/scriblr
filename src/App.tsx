import React from 'react'
import { useState, Fragment } from 'react'
import ReactDOM from 'react-dom/client'
import './style/style.css'
import VisitorUI from './pages/VisitorUI'
import UserUI from './pages/UserUI'
import WriterUI from './pages/WriterUI'
import ReaderUI from './pages/ReaderUI'
import AdminUI from './pages/AdminUI'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <VisitorUI/>
    <ReaderUI/>
    <UserUI/>
  </React.StrictMode>
)
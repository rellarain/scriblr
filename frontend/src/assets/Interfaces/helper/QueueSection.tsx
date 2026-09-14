import { useState } from 'react'
import { QUEUE_DEPARTMENTS } from './queueSeed'

// Queue Console per scrilbrPlan.md's Helper page section: "view of all
// assigned/active console queues." Each console is one queue; checking its
// box means this helper is currently accepting chats from it.
//
// Departments (Pages) are collapsible cards, collapsed by default -- expand
// one to reveal its consoles nested inside as a flat checkbox list (no
// per-console collapse, no component list -- just the queue name and
// whether it's accepted).
function QueueSection() {
  const [expandedDepartments, setExpandedDepartments] = useState<Set<string>>(new Set())
  const [acceptedQueues, setAcceptedQueues] = useState<Set<string>>(new Set())

  function toggleDepartment(name: string) {
    setExpandedDepartments(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function toggleQueue(consoleId: string) {
    setAcceptedQueues(prev => {
      const next = new Set(prev)
      if (next.has(consoleId)) next.delete(consoleId)
      else next.add(consoleId)
      return next
    })
  }

  return (
    <div className="queueSection">
      <div className="queueScroll">
        <div className="helperPlaceholderContent">
          <h2>Queue</h2>
          <p>Check a queue below to accept chats from it.</p>
        </div>

        {QUEUE_DEPARTMENTS.map(department => {
          const isDeptExpanded = expandedDepartments.has(department.name)
          return (
            <div key={department.name} className="queueDepartment">
              <button
                type="button"
                className="queueDepartmentToggle"
                aria-expanded={isDeptExpanded}
                onClick={() => toggleDepartment(department.name)}
              >
                <span aria-hidden="true">{isDeptExpanded ? '▾' : '▸'}</span>
                {department.name}
              </button>

              {isDeptExpanded && (
                <div className="queueDepartmentBody">
                  {department.consoles.length === 0 && (
                    <p className="queueEmptyNote">No consoles defined yet.</p>
                  )}
                  {department.consoles.map(consoleEntry => {
                    const consoleId = `${department.name}::${consoleEntry.name}`
                    const isAccepted = acceptedQueues.has(consoleId)
                    return (
                      <label
                        key={consoleId}
                        className={isAccepted ? 'queueConsole queueConsole--selected' : 'queueConsole'}
                      >
                        <input
                          type="checkbox"
                          checked={isAccepted}
                          onChange={() => toggleQueue(consoleId)}
                        />
                        {consoleEntry.name}
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default QueueSection

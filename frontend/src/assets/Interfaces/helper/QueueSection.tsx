import { useState } from 'react'
import { useChannels } from '../../../channels/channelStore'
import { childrenOf } from '../../../channels/channelTree'

// Queue Console per scrilbrPlan.md's Helper page section: "view of all
// assigned/active console queues." Each console of the channel list is one
// queue; checking its box means this helper is currently accepting chats
// from it.
//
// Interfaces are collapsible cards, collapsed by default -- expand one to
// reveal its consoles nested inside as a flat checkbox list.
function QueueSection() {
  const { index } = useChannels()
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

        {childrenOf(index, null).map(department => {
          const isDeptExpanded = expandedDepartments.has(department.id)
          const consoles = childrenOf(index, department.id)
          return (
            <div key={department.id} className="queueDepartment">
              <button
                type="button"
                className="queueDepartmentToggle"
                aria-expanded={isDeptExpanded}
                onClick={() => toggleDepartment(department.id)}
              >
                <span aria-hidden="true">{isDeptExpanded ? '▾' : '▸'}</span>
                {department.name}
              </button>

              {isDeptExpanded && (
                <div className="queueDepartmentBody">
                  {consoles.length === 0 && (
                    <p className="queueEmptyNote">No consoles defined yet.</p>
                  )}
                  {consoles.map(consoleEntry => {
                    const consoleId = consoleEntry.id
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

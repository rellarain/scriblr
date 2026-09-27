import ResourceTree from './ResourceTree'
import { ASSESSMENT_LABEL, type ResourcesWorkspace } from './useResources'
import type { ResourceQuestion, ResourceQuestionOption } from '../../../../api/types'
import './resources.scss'

function newLocalId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

function blankQuestion(): ResourceQuestion {
  return {
    id: newLocalId('q'),
    prompt: '',
    options: [0, 1, 2, 3].map((_, i) => ({ id: newLocalId('opt'), text: '', isCorrect: i === 0 })),
  }
}

// The separate Exam/Test/Quiz question-bank builder: same shared structural
// tree as the Article Builder, but a console holds an Exam, a component a
// Test, and a feature a Quiz -- an Interface holds none.
function QuizBuilder({ resources, selectedId, onSelectNode }: {
  resources: ResourcesWorkspace
  selectedId: string | null
  onSelectNode: (id: string) => void
}) {
  const node = selectedId ? resources.findNode(selectedId) : undefined
  const assessLabel = node ? ASSESSMENT_LABEL[node.kind] : null
  const questions = selectedId ? resources.assessmentOf(selectedId).questions : []

  function saveQuestions(next: ResourceQuestion[]) {
    if (selectedId) void resources.setAssessment(selectedId, next)
  }
  function addQuestion() {
    saveQuestions([...questions, blankQuestion()])
  }
  function updatePrompt(qi: number, prompt: string) {
    saveQuestions(questions.map((q, i) => (i === qi ? { ...q, prompt } : q)))
  }
  function updateOption(qi: number, oi: number, patch: Partial<ResourceQuestionOption>) {
    saveQuestions(questions.map((q, i) => {
      if (i !== qi) return q
      return { ...q, options: q.options.map((o, j) => (j === oi ? { ...o, ...patch } : o)) }
    }))
  }
  function markCorrect(qi: number, oi: number) {
    saveQuestions(questions.map((q, i) => {
      if (i !== qi) return q
      return { ...q, options: q.options.map((o, j) => ({ ...o, isCorrect: j === oi })) }
    }))
  }

  return (
    <div className="resSplit">
      <ResourceTree
        childrenOf={resources.childrenOf} selectedId={selectedId} onSelect={onSelectNode}
        onAddChild={(parentId, kind) => { void resources.addNode(parentId, kind).then(id => { if (id) onSelectNode(id) }) }}
        onRename={(id, name) => { void resources.renameNode(id, name) }}
        onDelete={id => { void resources.deleteNode(id) }}
      />
      <div className="resPane">
        {!node ? (
          <div className="resPane--empty">Select or add an interface on the left to get started.</div>
        ) : !assessLabel ? (
          <p className="resEmptyNote">
            Select a Console, Component or Feature on the left to build its Exam, Test or Quiz.
            Consoles get an Exam, Components a Test, Features a Quiz.
          </p>
        ) : (
          <>
            <div className="resToolbar">
              <h2 className="resQuizTitle">{node.name || `Untitled ${node.kind}`}</h2>
              <span className="resBadge">{assessLabel}</span>
            </div>
            {questions.map((q, qi) => (
              <div key={q.id} className="resCard">
                <input
                  type="text" className="resCardTitle" value={q.prompt} placeholder="Question prompt"
                  onChange={e => updatePrompt(qi, e.target.value)}
                />
                {q.options.map((o, oi) => (
                  <div key={o.id} className="resOptionRow">
                    <input
                      type="radio" name={`resQuestion-${q.id}`} checked={o.isCorrect} aria-label="Mark correct"
                      onChange={() => markCorrect(qi, oi)}
                    />
                    <input
                      type="text" className="resOptionText" value={o.text} placeholder="Answer option"
                      onChange={e => updateOption(qi, oi, { text: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            ))}
            <button type="button" className="resDashedBtn" onClick={addQuestion}>+ Add question</button>
          </>
        )}
      </div>
    </div>
  )
}

export default QuizBuilder

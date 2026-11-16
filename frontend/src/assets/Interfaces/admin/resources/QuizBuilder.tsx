import MarkupEditor from '../../../../components/markup/MarkupEditor'
import { assignQuestionIds } from '../../../../lib/markup/questionIds'
import ResourceTree from './ResourceTree'
import { useNodeText } from './useNodeText'
import { ASSESSMENT_LABEL, type ResourcesWorkspace } from './useResources'
import './resources.scss'

// The Exam/Test/Quiz builder: the same tree as the Article Builder (a console holds an Exam, a component a Test, a feature a Quiz; an
// interface none), and the assessment's questions written in the markup editor. These questions are not taken: articles and lessons pull
// them in as practice, by the permanent id each question is given when it is saved (and shown in the field once it is left).
function QuizBuilder({ resources, selectedId, onSelectNode }: {
  resources: ResourcesWorkspace
  selectedId: string | null
  onSelectNode: (id: string) => void
}) {
  const node = selectedId ? resources.findNode(selectedId) : undefined
  const assessLabel = node ? ASSESSMENT_LABEL[node.kind] : null
  const stored = selectedId ? resources.assessmentOf(selectedId).text : ''
  const [text, setText] = useNodeText(selectedId, stored, (id, next) => { void resources.setAssessment(id, assignQuestionIds(next)) })
  const showIds = () => { const ided = assignQuestionIds(text); if (ided !== text) setText(ided) }

  return (
    <div className="resSplit">
      <ResourceTree childrenOf={resources.childrenOf} selectedId={selectedId} onSelect={onSelectNode} />
      <div className="resPane">
        {!node ? (
          <div className="resPane--empty">Select or add an interface on the left to get started.</div>
        ) : !assessLabel ? (
          <p className="resEmptyNote">Select a Console, Component or Feature on the left to build its Exam, Test or Quiz.</p>
        ) : (
          <>
            <div className="resToolbar">
              <h2 className="resQuizTitle">{node.name || `Untitled ${node.kind}`}</h2>
              <span className="resBadge">{assessLabel}</span>
            </div>
            <MarkupEditor value={text} onChange={setText} onBlur={showIds} label={`${assessLabel} questions`} baseLevel={2} rows={16} placeholder={'???? A question\n?! The right choice\n?? A wrong choice'} />
          </>
        )}
      </div>
    </div>
  )
}

export default QuizBuilder

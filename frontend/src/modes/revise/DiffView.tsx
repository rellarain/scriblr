import type { DiffOp } from '../../types'

interface Props {
  ops: DiffOp[]
}

function DiffView({ ops }: Props) {
  return (
    <pre className="diff-view">
      {ops.map((op, i) => {
        if (op.op === 'equal') return <span key={i}>{op.text}</span>
        if (op.op === 'insert')
          return (
            <span key={i} className="diff-view__insert">
              {op.text}
            </span>
          )
        return (
          <span key={i} className="diff-view__delete">
            {op.text}
          </span>
        )
      })}
    </pre>
  )
}

export default DiffView

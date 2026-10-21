import React, { useState, useEffect, useRef } from 'react'

// Replacement untuk window.prompt() yang diblok dalam Electron
export default function PromptModal({ title, placeholder, defaultValue = '', onSubmit, onCancel }) {
  const [val, setVal] = useState(defaultValue)
  const inputRef = useRef(null)

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [])

  const submit = () => {
    if (val.trim()) onSubmit(val.trim())
    else onCancel()
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <p className="modal-title">{title}</p>
        <input
          ref={inputRef}
          type="text"
          value={val}
          placeholder={placeholder}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') onCancel()
          }}
        />
        <div className="modal-actions">
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={submit}>OK</button>
        </div>
      </div>
    </div>
  )
}

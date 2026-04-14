import { useEffect, useState } from 'react';

export default function PromptModal({
  isOpen,
  title,
  description = 'Use um nome curto e claro para manter sua estrutura facil de navegar.',
  confirmLabel = 'Confirmar',
  onConfirm,
  onCancel,
  defaultValue = '',
}) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
    }
  }, [defaultValue, isOpen]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(value.trim());
  };

  return (
    <div
      className="dialog-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div className="dialog">
        <div className="dialog-header">
          <div className="dialog-title-group">
            <h3>{title}</h3>
            <p className="dialog-copy">{description}</p>
          </div>
        </div>

        <input
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') handleConfirm();
            if (event.key === 'Escape') onCancel();
          }}
          placeholder="Digite o nome..."
          maxLength={120}
        />

        <div className="dialog-actions">
          <button className="btn-secondary" type="button" onClick={onCancel}>Cancelar</button>
          <button className="btn-primary" type="button" onClick={handleConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

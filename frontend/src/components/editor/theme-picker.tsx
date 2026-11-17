'use client';

import { Icon } from '@/components/icon';
import { themeChoices, themeSample } from '@/editor/themes';
import { Cover } from '@/components/cover';
import type { ThemeId } from '@/domain/types';

export function ThemePicker({ value, onChange }: { value: ThemeId; onChange: (theme: ThemeId) => void }) {
  return (
    <div className="ed-theme-list" role="radiogroup" aria-label="색 테마">
      {themeChoices.map((theme) => (
        <button key={theme.id} type="button" role="radio" aria-checked={value === theme.id} aria-label={theme.label} className={`ed-theme ${value === theme.id ? 'is-on' : ''}`} onClick={() => onChange(theme.id)}>
          <span className="ed-mini" aria-hidden="true">
            <span className="ed-mini-scale">
              <Cover invitation={themeSample(theme.id)} />
            </span>
          </span>
          <span className="ed-theme-copy">
            <strong>{theme.label}</strong>
            <span className="ed-chips">
              {theme.chips.map((color) => (
                <span key={color} className="ed-chip" style={{ background: color }} />
              ))}
            </span>
            {value === theme.id ? <Icon name="check-circle" size={18} /> : null}
          </span>
        </button>
      ))}
    </div>
  );
}

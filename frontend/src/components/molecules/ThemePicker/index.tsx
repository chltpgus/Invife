'use client';
import CheckCircle from '@/components/atoms/svg/CheckCircle';
import { themeChoices, themeSample } from '@/editor/themes';
import Cover from '@/components/molecules/Cover';
import type { ThemeId } from '@/domain/types';

interface ThemePickerProps { value: ThemeId; onChange: (theme: ThemeId) => void }

const ThemePicker = ({ value, onChange }: ThemePickerProps) => {
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
                <span key={color} className="ed-chip" style={{ '--chip': color }} />
              ))}
            </span>
            {value === theme.id ? <CheckCircle size={18} /> : null}
          </span>
        </button>
      ))}
    </div>
  );
}

export default ThemePicker;

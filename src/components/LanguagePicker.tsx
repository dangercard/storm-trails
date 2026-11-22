import { languageName, OFFERED, setLanguage, useI18n } from '../i18n';

/**
 * Switches the site's language. Shown only when there's a choice: more than one language offered, or one opened by
 * link that isn't offered yet (a translation being reviewed), so there's a way back.
 */
const LanguagePicker: React.FC = () => {
  const { lang, m } = useI18n();
  const langs = OFFERED.includes(lang) ? OFFERED : [...OFFERED, lang];
  if (langs.length < 2) return null;
  return (
    <label className="language">
      <span className="sr-only">{m.language}</span>
      <select value={lang} onChange={(e) => setLanguage(e.target.value)}>
        {langs.map((l) => (
          <option key={l} value={l} lang={l}>
            {languageName(l)}
          </option>
        ))}
      </select>
    </label>
  );
};

export default LanguagePicker;

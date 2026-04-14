function IconWrapper({ children }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function getCategory(name = '') {
  const normalized = name.toLowerCase();

  if (/mat|algebra|geometr|calculo/.test(normalized)) return 'math';
  if (/bio|ciencia|anatom|celul|genet/.test(normalized)) return 'biology';
  if (/fisic|fisica|mecanic|energia/.test(normalized)) return 'physics';
  if (/quim|chem|molec|organica/.test(normalized)) return 'chemistry';
  if (/hist|sociol|filos|geograf/.test(normalized)) return 'history';
  if (/portugu|gramat|literat|reda|texto/.test(normalized)) return 'language';
  if (/ingles|english|idioma|espanhol|frances/.test(normalized)) return 'language-foreign';

  return 'general';
}

export function getSubjectAccent(name = '') {
  const category = getCategory(name);

  const map = {
    math: '#2f6aee',
    biology: '#2f855a',
    physics: '#7c3aed',
    chemistry: '#dd6b20',
    history: '#9c4221',
    language: '#c05621',
    'language-foreign': '#00838f',
    general: '#475569',
  };

  return map[category] || map.general;
}

export default function SubjectIcon({ name }) {
  const category = getCategory(name);

  if (category === 'math') {
    return <IconWrapper><path d="M4 7h16M7 4v16M9 15l6-6M9 9l6 6" /></IconWrapper>;
  }

  if (category === 'biology') {
    return <IconWrapper><path d="M7 18c6 0 10-4 10-10-6 0-10 4-10 10Z" /><path d="M7 18c0-5 4-9 9-9" /></IconWrapper>;
  }

  if (category === 'physics') {
    return <IconWrapper><circle cx="12" cy="12" r="2.5" /><path d="M4.5 12a7.5 3.5 0 0 0 15 0 7.5 3.5 0 0 0-15 0Z" /><path d="M8.2 5.5a7.5 3.5 60 0 0 7.6 13" /><path d="M15.8 5.5a7.5 3.5 120 0 0-7.6 13" /></IconWrapper>;
  }

  if (category === 'chemistry') {
    return <IconWrapper><path d="M10 3v5l-4.5 7.5A3 3 0 0 0 8.1 20h7.8a3 3 0 0 0 2.6-4.5L14 8V3" /><path d="M9 13h6" /></IconWrapper>;
  }

  if (category === 'history') {
    return <IconWrapper><path d="M6 4.5h10a2 2 0 0 1 2 2V20H8a2 2 0 0 0-2-2V4.5Z" /><path d="M8 4.5A2.5 2.5 0 0 0 5.5 7V18" /><path d="M10 9h5M10 13h5" /></IconWrapper>;
  }

  if (category === 'language' || category === 'language-foreign') {
    return <IconWrapper><path d="M5 7h10M7 5a11 11 0 0 0 0 14M13 5a11 11 0 0 1 0 14" /><path d="M15 17h4M17 15v4" /></IconWrapper>;
  }

  return <IconWrapper><path d="M6 4h9l3 3v13H6z" /><path d="M15 4v4h4" /><path d="M9 13h6M9 17h4" /></IconWrapper>;
}

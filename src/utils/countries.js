/**
 * Country helpers shared by the geography quizzes.
 *
 * Quiz data is written with English country names; these helpers turn them
 * into ISO region codes and then into names in the player's language, using
 * the browser's built-in Intl.DisplayNames (so "Japan" shows as "Jepun",
 * "日本", "ஜப்பான்" or "Jepang"). If the browser can't, the English name is kept.
 */
const NAME_TO_CODE = {
  'Afghanistan': 'AF', 'Argentina': 'AR', 'Australia': 'AU', 'Austria': 'AT',
  'Bangladesh': 'BD', 'Belgium': 'BE', 'Brazil': 'BR', 'Cambodia': 'KH',
  'Canada': 'CA', 'Chile': 'CL', 'China': 'CN', 'Colombia': 'CO', 'Croatia': 'HR',
  'Czech Republic': 'CZ', 'Denmark': 'DK', 'Egypt': 'EG', 'Ethiopia': 'ET',
  'European Union': 'EU', 'Finland': 'FI', 'France': 'FR', 'Germany': 'DE',
  'Ghana': 'GH', 'Greece': 'GR', 'Hungary': 'HU', 'Iceland': 'IS', 'India': 'IN',
  'Indonesia': 'ID', 'Iran': 'IR', 'Iraq': 'IQ', 'Israel': 'IL', 'Italy': 'IT',
  'Japan': 'JP', 'Jordan': 'JO', 'Kazakhstan': 'KZ', 'Kenya': 'KE', 'Malaysia': 'MY',
  'Mexico': 'MX', 'Morocco': 'MA', 'Myanmar': 'MM', 'Nepal': 'NP',
  'Netherlands': 'NL', 'New Zealand': 'NZ', 'Nigeria': 'NG', 'Norway': 'NO',
  'Pakistan': 'PK', 'Peru': 'PE', 'Philippines': 'PH', 'Poland': 'PL',
  'Portugal': 'PT', 'Romania': 'RO', 'Russia': 'RU', 'Saudi Arabia': 'SA',
  'Singapore': 'SG', 'South Africa': 'ZA', 'South Korea': 'KR', 'Spain': 'ES',
  'Sri Lanka': 'LK', 'Sweden': 'SE', 'Switzerland': 'CH', 'Thailand': 'TH',
  'Turkey': 'TR', 'UAE': 'AE', 'Ukraine': 'UA', 'United Kingdom': 'GB',
  'United States': 'US', 'Vietnam': 'VN', 'Zambia': 'ZM',
};

export function codeFor(name) {
  return NAME_TO_CODE[name] ?? null;
}

/** Flag emoji for an ISO region code. */
export function flagFor(code) {
  if (!code) return '';
  return code.toUpperCase().split('').map(c => String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0))).join('');
}

const cache = new Map();
function displayNames(lang) {
  if (!cache.has(lang)) {
    let dn = null;
    try { dn = new Intl.DisplayNames([lang], { type: 'region' }); } catch { dn = null; }
    cache.set(lang, dn);
  }
  return cache.get(lang);
}

/** A country's name in the given language, falling back to English. */
export function countryName(englishName, lang = 'en') {
  const code = codeFor(englishName);
  if (!code || lang === 'en') return englishName;
  try {
    return displayNames(lang)?.of(code) || englishName;
  } catch {
    return englishName;
  }
}

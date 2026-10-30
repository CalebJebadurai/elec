// ECI registered party name -> TCPD party code, by legal identity (same registered name).
// Written before any state-wise result page was downloaded (AMENDMENT-1.md, rule 3).
// Factions registered under new names are deliberately absent and keep their ECI name.
export const PARTY_MAP: Record<string, string> = {
  'Aam Aadmi Party': 'AAAP',
  'All India Anna Dravida Munnetra Kazhagam': 'ADMK',
  'Asom Gana Parishad': 'AGP',
  'All India Forward Bloc': 'AIFB',
  'All India Majlis-E-Ittehadul Muslimeen': 'AIMIM',
  'All India N.R. Congress': 'AINRC',
  'All India Trinamool Congress': 'AITC',
  'All India United Democratic Front': 'AIUDF',
  'Assam Jatiya Parishad': 'AJP',
  'AJSU Party': 'AJSUP',
  'Biju Janata Dal': 'BJD',
  'Bharatiya Janata Party': 'BJP',
  'Bodoland Peoples Front': 'BOPF',
  'Bharat Rashtra Samithi': 'BRS',
  'Telangana Rashtra Samithi': 'BRS',
  'Bahujan Samaj Party': 'BSP',
  'Bharatiya Tribal Party': 'BTP',
  'Bahujan Vikas Aaghadi': 'BVA',
  'Communist Party of India': 'CPI',
  'Communist Party of India (Marxist)': 'CPM',
  'Communist Party of India (Marxist-Leninist) (Liberation)': 'CPI(ML)(L)',
  'Dravida Munnetra Kazhagam': 'DMK',
  'Hindustani Awam Morcha (Secular)': 'HAMS',
  'Indian National Congress': 'INC',
  'Independent': 'IND',
  'Indian National Lok Dal': 'INLD',
  'Indian Union Muslim League': 'IUML',
  'Janta Congress Chhattisgarh (J)': 'JCC(J)',
  'Janata Dal (Secular)': 'JD(S)',
  'Janata Dal (United)': 'JD(U)',
  'Jammu & Kashmir National Conference': 'JKN',
  'Jammu & Kashmir Peoples Democratic Party': 'JKPDP',
  'Jharkhand Mukti Morcha': 'JMM',
  'Jannayak Janta Party': 'JNJP',
  'Janasena Party': 'JnP',
  'Kerala Congress': 'KEC',
  'Kerala Congress (B)': 'KEC(B)',
  'Kerala Congress (Jacob)': 'KEC(J)',
  'Kerala Congress (M)': 'KEC(M)',
  'Lok Janshakti Party': 'LJP',
  'Mizo National Front': 'MNF',
  'Maharashtra Navnirman Sena': 'MNS',
  'Nationalist Congress Party': 'NCP',
  "National People's Party": 'NPEP',
  'Pattali Makkal Katchi': 'PMK',
  'Peasants And Workers Party of India': 'PWPI',
  'Rashtriya Janata Dal': 'RJD',
  'Rashtriya Lok Dal': 'RLD',
  'Revolutionary Marxist Party of India': 'RMPOI',
  'Revolutionary Socialist Party': 'RSP',
  'Sikkim Democratic Front': 'SDF',
  'Shiv Sena': 'SHS',
  'Sikkim Krantikari Morcha': 'SKM',
  'Samajwadi Party': 'SP',
  'Telugu Desam': 'TDP',
  "United People's Party, Liberal": 'UPPL',
  'Viduthalai Chiruthaigal Katchi': 'VCK',
  'Vikassheel Insaan Party': 'VSIP',
  'Yuvajana Sramika Rythu Congress Party': 'YSRCP',
};

const key = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
const LOOKUP = Object.fromEntries(Object.entries(PARTY_MAP).map(([k, v]) => [key(k), v]));

/** TCPD code for an ECI party name, or the ECI name itself when unmapped. */
export function mapParty(eciName: string): { code: string; mapped: boolean } {
  const c = LOOKUP[key(eciName)];
  return c ? { code: c, mapped: true } : { code: eciName.trim(), mapped: false };
}

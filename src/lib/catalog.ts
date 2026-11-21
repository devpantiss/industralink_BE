/**
 * Allowed values for fields stored as plain text in the database.
 * Same lists as the apps (dashboard src/lib/labels.ts). To add a value, add it here.
 */
export const TRADES = [
  'welder',
  'electrician',
  'fitter',
  'machine_operator',
  'driver',
  'crane_operator',
  'helper',
  'security',
  'supervisor',
  'other',
] as const;

export const SECTORS = ['mining', 'metals', 'shipping', 'petroleum', 'logistics', 'automotive'] as const;
export const EXPERIENCE = ['fresher', '1_2', '3_5', '5_plus'] as const;
export const SHIFT_PREFERENCES = ['day', 'night', 'rotational', 'any'] as const;
export const AVAILABILITY = ['immediate', '15_days', '30_days'] as const;
export const EMPLOYMENT_TYPES = ['permanent', 'contract', 'any'] as const;
export const GENDERS = ['male', 'female', 'other'] as const;
export const HIRING_TYPES = ['direct', 'agency'] as const;
export const LANGUAGES = ['en', 'hi', 'or'] as const;

export const WORKER_DOC_TYPES = [
  'resume',
  'id_proof',
  'iti_diploma',
  'trade_licence',
  'driving_licence',
  'experience_letter',
  'safety_cert',
] as const;

export const COMPANY_DOC_TYPES = ['gst', 'udyam', 'cin', 'other'] as const;

/** Display names used in admin screens. */
export const SECTOR_LABEL: Record<(typeof SECTORS)[number], string> = {
  mining: 'Mining',
  metals: 'Metals & Steel',
  shipping: 'Shipping & Ports',
  petroleum: 'Petroleum',
  logistics: 'Logistics',
  automotive: 'Automotive',
};

export const HIRING_TYPE_LABEL: Record<(typeof HIRING_TYPES)[number], string> = {
  direct: 'Hiring for own company',
  agency: 'Contractor / placement agency',
};

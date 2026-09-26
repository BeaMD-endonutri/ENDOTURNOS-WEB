import type { Consultation, MascotKey, Staff } from '../types'

export const MASCOTS: Array<{ key: MascotKey; name: string; src: string; greeting: string }> = [
  { key: 'apple', name: 'Manzanita', src: `${import.meta.env.BASE_URL}mascots/apple.png`, greeting: '¡Vamos a por un día redondo!' },
  { key: 'flame', name: 'Llamita', src: `${import.meta.env.BASE_URL}mascots/flame.png`, greeting: '¡Hoy vienes con chispa!' },
  { key: 'puffin', name: 'Puffin', src: `${import.meta.env.BASE_URL}mascots/puffin.png`, greeting: 'Tu día está bajo control.' },
  { key: 'worm', name: 'Gusanito', src: `${import.meta.env.BASE_URL}mascots/worm.png`, greeting: 'Pasito a pasito, todo sale.' },
  { key: 'cat', name: 'Gatita', src: `${import.meta.env.BASE_URL}mascots/cat.png`, greeting: '¡Que tengas un turno estupendo!' },
  { key: 'llama', name: 'Llama', src: `${import.meta.env.BASE_URL}mascots/llama.png`, greeting: '¡Hoy avanzamos con calma y alegría!' },
  { key: 'glucometer', name: 'Glucómetro', src: `${import.meta.env.BASE_URL}mascots/glucometer.png`, greeting: '¡Todo medido y bajo control!' },
  { key: 'pineapple', name: 'Piña', src: `${import.meta.env.BASE_URL}mascots/pineapple.png`, greeting: '¡Ponle alegría a tu turno!' },
  { key: 'dumbbell', name: 'Mancuerna', src: `${import.meta.env.BASE_URL}mascots/dumbbell.png`, greeting: '¡A por un turno fuerte y ligero!' },
]

export const STAFF_IDS = {
  P1: 'demo-0001', P2: 'demo-0002', P3: 'demo-0003', P4: 'demo-0004',
  P5: 'demo-0005', P6: 'demo-0006', P7: 'demo-0007', P8: 'demo-0008',
}

export const DEMO_STAFF: Staff[] = [
  ['PROFESIONAL 1', 'profesional1', 2100, 'apple'], ['PROFESIONAL 2', 'profesional2', 2100, 'cat'],
  ['PROFESIONAL 3', 'profesional3', 2100, 'flame'], ['PROFESIONAL 4', 'profesional4', 2100, 'puffin'],
  ['PROFESIONAL 5', 'profesional5', 2100, 'worm'], ['PROFESIONAL 6', 'profesional6', 2100, 'apple'],
  ['PROFESIONAL 7', 'profesional7', 2100, 'puffin'], ['PROFESIONAL 8', 'profesional8', 1400, 'cat'],
].map(([display_name, username, weekly_minutes, mascot_key], i) => ({
  id: Object.values(STAFF_IDS)[i], user_id: null, display_name: String(display_name), username: String(username),
  role: 'professional', mascot_key: mascot_key as Staff['mascot_key'], active: true, weekly_minutes: Number(weekly_minutes),
}))

export const CONSULTATIONS: Consultation[] = [
  ['PLANTA', 'Planta', 'PL', '#3a7d63'], ['HDD', 'Hospital de día', 'HDD', '#297b8d'],
  ['EDA', 'EDA', 'EDA', '#c56d54'], ['EDA_GRUPAL', 'EDA grupal', 'EDAG', '#d08469'],
  ['NUTRICION', 'Nutrición', 'NUT', '#719748'], ['PF', 'PF', 'PF', '#8b6bb0'],
  ['PAAF', 'PAAF', 'PAAF', '#a25b91'], ['EN1', 'EN1', 'EN1', '#5e8cb8'],
  ['EN2', 'EN2', 'EN2', '#669fc7'], ['EN_GRUPAL', 'EN grupal', 'ENG', '#7f86c7'],
  ['AMBULATORIO', 'Ambulatorio', 'AMB', '#b0823f'], ['EPA', 'EPA', 'EPA', '#4f9a91'],
].map(([id, label, short_label, color]) => ({ id, label, short_label, color, active: true }))

export const HOLIDAYS: Record<string, string> = {
  '2026-10-12': 'Fiesta Nacional', '2026-11-02': 'Todos los Santos (traslado)',
  '2026-12-07': 'Constitución (traslado)', '2026-12-08': 'Inmaculada',
  '2026-12-24': 'Festivo contemplado', '2026-12-25': 'Navidad', '2026-12-31': 'Festivo contemplado',
}

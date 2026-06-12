/**
 * Dashboard Design Constants
 * Palettes, themes, et configurations réutilisables pour les charts et UI
 */

export const DASHBOARD_COLORS = {
  // Primary colors
  primary: '#0ea5e9',
  primaryDark: '#0284c7',
  primaryLight: '#38bdf8',

  // Secondary colors
  secondary: '#64748b',
  accent: '#f59e0b',
  accentDark: '#d97706',

  // Status colors
  success: '#10b981',
  successLight: '#d1fae5',
  warning: '#f59e0b',
  warningLight: '#fef3c7',
  danger: '#ef4444',
  dangerLight: '#fee2e2',
  info: '#3b82f6',
  infoLight: '#dbeafe',

  // Security levels
  secure: '#10b981',
  cautious: '#f59e0b',
  suspicious: '#ef4444',
  blocked: '#7c3aed',
  quarantined: '#8b5cf6',

  // Neutral
  white: '#ffffff',
  black: '#000000',
  gray50: '#f9fafb',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray300: '#d1d5db',
  gray400: '#9ca3af',
  gray500: '#6b7280',
  gray600: '#4b5563',
  gray700: '#374151',
  gray800: '#1f2937',
  gray900: '#111827',

  // Dark mode
  dark: '#0f172a',
  darkCard: '#1e293b',
  darkBorder: '#334155',
};

export const CHART_COLORS = {
  // Line chart colors
  line1: '#1f6feb',
  line2: '#0ea5a8',
  line3: '#f59e0b',
  line4: '#10b981',
  line5: '#8b5cf6',

  // Bar chart colors
  bar: [
    '#2c7be5', '#4ea1f3', '#69d2bf', '#23b26d', '#efb84f',
    '#f68d52', '#d66de2', '#7e89f7', '#a78bfa', '#f87171'
  ],

  // Status colors palette
  status: [
    '#f5b643', // Suspect - warning
    '#e55353', // Blocked - danger
    '#9f7aea', // Quarantined - purple
    '#22c55e', // Clean - success
  ],

  // Heat map
  heatmapLow: '#dcfce7',
  heatmapMid: '#86efac',
  heatmapHigh: '#10b981',
  heatmapVeryHigh: '#047857',

  // Pie/Donut colors
  pie: ['#1f6feb', '#0ea5a8', '#f59e0b', '#e11d48', '#7c3aed'],
};

export const THEME_CONFIG = {
  light: {
    background: '#ffffff',
    surface: '#f9fafb',
    text: '#111827',
    textSecondary: '#6b7280',
    border: '#e5e7eb',
    shadow: 'rgba(0, 0, 0, 0.1)',
  },
  dark: {
    background: '#0f172a',
    surface: '#1e293b',
    text: '#f9fafb',
    textSecondary: '#cbd5e1',
    border: '#334155',
    shadow: 'rgba(0, 0, 0, 0.3)',
  },
};

export const STORAGE_UNITS = {
  B: 1,
  KB: 1024,
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
  TB: 1024 * 1024 * 1024 * 1024,
};

export const METRIC_FORMATS = {
  compact: (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return String(value);
  },
  percent: (value: number) => `${Math.round(value)}%`,
  bytes: (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  },
};

export const SECTION_CONFIGS = {
  overview: {
    title: '📊 Vue d\'ensemble',
    description: 'Métriques clés du système',
    color: '#3b82f6',
  },
  security: {
    title: '🔒 Sécurité',
    description: 'Alertes et incidents de sécurité',
    color: '#ef4444',
  },
  storage: {
    title: '💾 Stockage',
    description: 'Utilisation et capacité',
    color: '#0ea5e9',
  },
  users: {
    title: '👥 Utilisateurs',
    description: 'Activité et statistiques utilisateurs',
    color: '#10b981',
  },
  files: {
    title: '📁 Fichiers',
    description: 'Distribution et activité des fichiers',
    color: '#f59e0b',
  },
  trends: {
    title: '📈 Tendances',
    description: 'Croissance et insights',
    color: '#64748b',
  },
};

export const CHART_OPTIONS_BASE = {
  chart: {
    toolbar: { show: false },
    zoom: { enabled: false },
    animations: { enabled: true, easing: 'easeout', speed: 300 },
    foreColor: DASHBOARD_COLORS.gray700,
  },
  dataLabels: { enabled: false },
  stroke: { curve: 'smooth', width: 2 },
  tooltip: { theme: 'light' },
  legend: { show: false },
  grid: { borderColor: DASHBOARD_COLORS.gray200 },
  xaxis: {
    labels: { style: { colors: DASHBOARD_COLORS.gray500 } },
    axisBorder: { show: false },
    axisTicks: { show: false },
  },
  yaxis: {
    labels: { style: { colors: DASHBOARD_COLORS.gray500 } },
  },
  fill: { opacity: 0.85 },
};

export const APEX_CHART_DEFAULT_OPTIONS = {
  chart: {
    fontFamily: 'Inter, system-ui, sans-serif',
    background: 'transparent',
    toolbar: { show: false },
    zoom: { enabled: false },
    animations: { enabled: true, easing: 'easeout', speed: 450 },
  },
  legend: { show: false },
  tooltip: { theme: 'light' },
  dataLabels: { enabled: false },
  markers: { size: 4 },
  stroke: { width: 2 },
  grid: {
    show: true,
    borderColor: DASHBOARD_COLORS.gray200,
    strokeDashArray: 4,
  },
  xaxis: {
    labels: { style: { colors: DASHBOARD_COLORS.gray500 } },
    axisBorder: { show: false },
    axisTicks: { show: false },
  },
  yaxis: {
    labels: { style: { colors: DASHBOARD_COLORS.gray500 } },
  },
  fill: {
    type: 'gradient',
    gradient: {
      shade: 'light',
      shadeIntensity: 0.35,
      opacityFrom: 0.85,
      opacityTo: 0.65,
      stops: [0, 100],
    },
  },
};

/**
 * Dashboard Analytics Module Exports
 * Exporte tous les composants et constantes réutilisables
 */

// Base Components
export { KPICardComponent, type KPIMetric } from './kpi-card.component';
export { StatCardComponent } from './stat-card.component';
export { DashboardSectionComponent } from './dashboard-section.component';
export { ChartWrapperComponent, type ChartConfig } from './chart-wrapper.component';

// Section Components
export { GlobalStatsSectionComponent } from './global-stats-section.component';
export { TenantStatsSectionComponent } from './tenant-stats-section.component';

// Chart Components (Phase 2)
export { SecurityChartsComponent } from './security-charts.component';
export { StorageChartsComponent } from './storage-charts.component';
export { UsersChartsComponent } from './users-charts.component';
export { FilesChartsComponent } from './files-charts.component';
export { TrendsChartsComponent } from './trends-charts.component';
export { ReusableChartComponent } from './reusable-chart.component';

// Constants
export {
  DASHBOARD_COLORS,
  CHART_COLORS,
  THEME_CONFIG,
  STORAGE_UNITS,
  METRIC_FORMATS,
  SECTION_CONFIGS,
  CHART_OPTIONS_BASE,
  APEX_CHART_DEFAULT_OPTIONS,
} from './dashboard-design.constants';

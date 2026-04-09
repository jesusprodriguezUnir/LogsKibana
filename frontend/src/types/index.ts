// Tipos compartidos entre App y RabbitExtractor

export interface LogRow {
  timestamp: string;
  level: string;
  service: string;
  host: string;
  logger: string;
  location: string;
  method: string;
  status_code: string;
  message: string;
}

export interface SearchResponse {
  total: number;
  page: number;
  page_size: number;
  sort_by: string;
  sort_order: string;
  items: LogRow[];
}

export interface GroupResponse {
  total_rows: number;
  available_group_fields: string[];
  selected_group_fields: string[];
  filter_options: {
    logger: string[];
    location: string[];
    status_code: string[];
  };
  diagnostics: Array<{ service: string; status_code: string; logger: string; count: number }>;
  groups: Record<string, Record<string, number>>;
}

export interface QueryFilters {
  searchText: string;
  level: string;
  service: string;
  host: string;
  logger: string;
  location: string;
  statusCode: string;
  messageText: string;
  loggerText: string;
  locationText: string;
}

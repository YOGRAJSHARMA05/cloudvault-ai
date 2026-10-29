export type AnalyticsBucket = {
  label: string;
  bytes: string;
  count: number;
};

export type MonthlyUploadPoint = {
  month: string;
  label: string;
  bytes: string;
  count: number;
};

export type RecentUploadView = {
  id: string;
  originalName: string;
  extension: string;
  size: string;
  createdAt: string;
};

export type RecentSummaryView = {
  fileId: string;
  fileName: string;
  executiveSummary: string;
  updatedAt: string;
};

export type SearchQueryStat = {
  query: string;
  count: number;
};

export type DashboardAnalytics = {
  storage: {
    totalBytes: string;
    byCategory: AnalyticsBucket[];
    monthly: MonthlyUploadPoint[];
  };
  fileTypes: AnalyticsBucket[];
  folderStats: {
    total: number;
    root: number;
    trashed: number;
  };
  recentUploads: RecentUploadView[];
  recentSummaries: RecentSummaryView[];
  searchStats: {
    total: number;
    last30Days: number;
    topQueries: SearchQueryStat[];
  };
};

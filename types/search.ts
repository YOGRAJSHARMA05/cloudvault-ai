export type SemanticMatchView = {
  id: string;
  originalName: string;
  mimeType: string;
  extension: string;
  size: string;
  folder: string;
  folderName: string;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
  score: number;
};

export type SemanticSearchResult = {
  matches: SemanticMatchView[];
  indexed: number;
  scanned: number;
};

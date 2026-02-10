export interface FormData {
  url: string;
  selectedImages: string[];
  triggerWord: string;
  trainingSteps: number;
}

export interface ArenaImage {
  id: number;
  title?: string;
  created_at: string;
  source?: { url: string };
  image?: {
    display: { url: string };
    large: { url: string };
    thumb: { url: string };
    square: { url: string };
    original: { url: string };
  };
}

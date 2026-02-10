import { View } from "reshaped";
import { type Control } from "react-hook-form";
import SelectedImageList from "./SelectedImageList";
import TrainingSettings from "./TrainingSettings";
import StatusAlerts from "./StatusAlerts";
import type { FormData } from "./types";

interface MutationState {
  isError: boolean;
  isSuccess: boolean;
  isPending: boolean;
  error?: { message: string } | null;
  data?: unknown;
}

interface SidebarProps {
  selectedImages: string[];
  control: Control<FormData>;
  onRemoveImage: (imageUrl: string) => void;
  onTrain: () => void;
  onDownload: () => void;
  trainMutation: MutationState;
  downloadMutation: MutationState;
}

export default function Sidebar({
  selectedImages,
  control,
  onRemoveImage,
  onTrain,
  onDownload,
  trainMutation,
  downloadMutation,
}: SidebarProps) {
  return (
    <View position="sticky" insetTop={2}>
      <View gap={2}>
        <SelectedImageList
          selectedImages={selectedImages}
          onRemove={onRemoveImage}
        />

        {selectedImages?.length > 0 && (
          <>
            <TrainingSettings
              control={control}
              onTrain={onTrain}
              onDownload={onDownload}
              isTraining={trainMutation.isPending}
              isDownloading={downloadMutation.isPending}
              hasSelection={selectedImages.length > 0}
            />

            <StatusAlerts
              trainMutation={trainMutation}
              downloadMutation={downloadMutation}
            />
          </>
        )}
      </View>
    </View>
  );
}

import { View, Text } from "reshaped";
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
    <View position="sticky" insetTop={4}>
      <View gap={4}>
        <Text variant="title-3" weight="bold">
          Selected Images ({selectedImages?.length || 0}/20)
        </Text>

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

            <View
              padding={3}
              borderRadius="medium"
              backgroundColor="neutral-faded"
            >
              <View gap={2}>
                <Text variant="body-2" weight="medium">
                  Selected Image URLs:
                </Text>
                <pre
                  style={{
                    fontSize: 12,
                    background:
                      "var(--rs-color-background-elevation-raised)",
                    padding: 8,
                    borderRadius: 4,
                    overflow: "auto",
                  }}
                >
                  {JSON.stringify(selectedImages, null, 2)}
                </pre>
              </View>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

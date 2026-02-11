import { useState, useCallback, useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { View, Text, Link, Alert } from "reshaped";
import { trpc } from "@/utils/trpc";
import { downloadBase64File } from "@/utils/downloadBase64File";
import ChannelUrlForm from "./ChannelUrlForm";
import ImageGrid from "./ImageGrid";
import Sidebar from "./Sidebar";
import TrainingProgress from "./TrainingProgress";
import type { FormData, ArenaImage } from "./types";

export type TrainingPhase =
  | "idle"
  | "preparing"
  | "queued"
  | "training"
  | "completed"
  | "failed";

export default function ArenaChannelFetcher() {
  const [submittedUrl, setSubmittedUrl] = useState("");
  const [trainingRequestId, setTrainingRequestId] = useState<string | null>(
    null,
  );
  const [trainingPhase, setTrainingPhase] = useState<TrainingPhase>("idle");
  const [trainingError, setTrainingError] = useState<string | null>(null);

  const { handleSubmit, control, setValue, getValues } = useForm<FormData>({
    defaultValues: {
      url: "",
      selectedImages: [],
      triggerWord: "",
      trainingSteps: 1000,
    },
  });

  const selectedImages = useWatch({ control, name: "selectedImages" });

  const { data, isLoading, error } = trpc.arena.getChannelImages.useQuery(
    { url: submittedUrl },
    { enabled: !!submittedUrl },
  );

  // --- Training polling queries ---
  const isPolling =
    !!trainingRequestId &&
    trainingPhase !== "completed" &&
    trainingPhase !== "failed" &&
    trainingPhase !== "idle";

  const trainingStatus = trpc.fal.getTrainingStatus.useQuery(
    { requestId: trainingRequestId! },
    {
      enabled: isPolling,
      refetchInterval: isPolling ? 2000 : false,
      refetchIntervalInBackground: true,
    },
  );

  // Derive phase from status response
  useEffect(() => {
    if (!trainingStatus.data) return;
    const s = trainingStatus.data.status;
    if (s === "IN_QUEUE") {
      setTrainingPhase("queued");
    } else if (s === "IN_PROGRESS") {
      setTrainingPhase("training");
    } else if (s === "COMPLETED") {
      setTrainingPhase("completed");
    }
  }, [trainingStatus.data]);

  useEffect(() => {
    if (trainingStatus.error) {
      setTrainingPhase("failed");
      setTrainingError(trainingStatus.error.message);
    }
  }, [trainingStatus.error]);

  const trainingResult = trpc.fal.getTrainingResult.useQuery(
    { requestId: trainingRequestId! },
    { enabled: trainingPhase === "completed" && !!trainingRequestId },
  );

  // --- Mutations ---
  const trainLoraMutation = trpc.fal.trainLora.useMutation({
    onSuccess: (data) => {
      setTrainingRequestId(data.requestId);
      setTrainingPhase("queued");
    },
    onError: (error) => {
      setTrainingPhase("failed");
      setTrainingError(error.message);
    },
  });

  const cancelTrainingMutation = trpc.fal.cancelTraining.useMutation({
    onSuccess: () => {
      setTrainingPhase("idle");
      setTrainingRequestId(null);
      setTrainingError(null);
    },
    onError: (error) => {
      // Still reset locally even if the cancel API call fails
      console.error("Cancel training error:", error);
      setTrainingPhase("idle");
      setTrainingRequestId(null);
      setTrainingError(null);
    },
  });

  const downloadZipMutation = trpc.fal.downloadImageZip.useMutation({
    onSuccess: (data) => {
      downloadBase64File(data.data, data.filename, "application/zip");
    },
    onError: (error) => console.error("Download failed:", error),
  });

  const onSubmit = (formData: FormData) => {
    if (formData.url.trim()) {
      setSubmittedUrl(formData.url.trim());
    }
  };

  const handleImageSelection = (imageUrl: string, isSelected: boolean) => {
    const currentSelected = selectedImages || [];
    if (isSelected) {
      if (currentSelected.length < 20) {
        setValue("selectedImages", [...currentSelected, imageUrl]);
      }
    } else {
      setValue(
        "selectedImages",
        currentSelected.filter((url) => url !== imageUrl),
      );
    }
  };

  const getImageUrl = (image: ArenaImage) => {
    return (
      image.image?.original.url ||
      image.image?.large.url ||
      image.image?.display.url
    );
  };

  const handleTrainLora = async () => {
    const formData = getValues();
    if (!formData.selectedImages || formData.selectedImages.length === 0) {
      alert("Please select at least one image to train the LoRA");
      return;
    }
    if (!formData.triggerWord.trim()) {
      alert("Please enter a trigger word for the LoRA");
      return;
    }
    // Reset state for new run
    setTrainingPhase("preparing");
    setTrainingError(null);
    setTrainingRequestId(null);

    try {
      await trainLoraMutation.mutateAsync({
        imageUrls: formData.selectedImages,
        triggerWord: formData.triggerWord,
        steps: formData.trainingSteps,
      });
    } catch {
      // error handled in onError callback
    }
  };

  const handleResetTraining = useCallback(() => {
    // Reset training state
    setTrainingRequestId(null);
    setTrainingPhase("idle");
    setTrainingError(null);
    // Reset arena / form state
    setSubmittedUrl("");
    setValue("url", "");
    setValue("selectedImages", []);
    setValue("triggerWord", "");
    setValue("trainingSteps", 1000);
  }, [setValue]);

  const handleCancelTraining = useCallback(() => {
    if (trainingRequestId) {
      cancelTrainingMutation.mutate({ requestId: trainingRequestId });
    } else {
      // No request ID yet (still in preparing phase) — just reset locally
      handleResetTraining();
    }
  }, [trainingRequestId, cancelTrainingMutation, handleResetTraining]);

  const handleDownloadZip = async () => {
    const formData = getValues();
    if (!formData.selectedImages || formData.selectedImages.length === 0) {
      alert("No images selected to download");
      return;
    }
    if (!formData.triggerWord.trim()) {
      alert("Please enter a trigger word for the filename");
      return;
    }
    try {
      await downloadZipMutation.mutateAsync({
        imageUrls: formData.selectedImages,
        triggerWord: formData.triggerWord,
      });
    } catch (error) {
      console.error("Download error:", error);
    }
  };

  const isTrainingActive = trainingPhase !== "idle";

  return (
    <>
      <View width="100%" padding={2}>
        <View gap={8}>
          <ChannelUrlForm
            control={control}
            onSubmit={handleSubmit(onSubmit)}
            isLoading={isLoading}
          />

          {error && (
            <Alert color="critical">Error: {error.message}</Alert>
          )}

          {data && (
            <View direction={{ s: "column", l: "row" }} gap={8}>
              <View.Item columns={{ s: 12, l: 8 }}>
                <View gap={6}>
                  <View gap={2}>
                    <Text variant="title-5" weight="bold">
                      {data.channel.title}
                    </Text>
                    <Text variant="body-2" color="neutral-faded">
                      Channel:{" "}
                      <Link
                        href={data.channel.url}
                        attributes={{
                          target: "_blank",
                          rel: "noopener noreferrer",
                        }}
                      >
                        {data.channel.slug}
                      </Link>
                    </Text>
                    <Text variant="body-2" color="neutral-faded">
                      Found {data.total} images
                    </Text>
                  </View>

                  <ImageGrid
                    images={data.images}
                    selectedImages={selectedImages}
                    onImageSelect={handleImageSelection}
                    getImageUrl={getImageUrl}
                  />
                </View>
              </View.Item>

              <View.Item columns={{ s: 12, l: 4 }}>
                <Sidebar
                  selectedImages={selectedImages}
                  control={control}
                  onRemoveImage={(url) => handleImageSelection(url, false)}
                  onTrain={handleTrainLora}
                  onDownload={handleDownloadZip}
                  downloadMutation={downloadZipMutation}
                  isSubmitting={trainLoraMutation.isPending}
                  isTrainingActive={isTrainingActive}
                />
              </View.Item>
            </View>
          )}
        </View>
      </View>

      <TrainingProgress
        phase={trainingPhase}
        logs={trainingStatus.data?.logs ?? []}
        result={trainingResult.data?.data ?? null}
        error={trainingError}
        queuePosition={trainingStatus.data?.queuePosition ?? undefined}
        onReset={handleResetTraining}
        onCancel={handleCancelTraining}
        isCancelling={cancelTrainingMutation.isPending}
      />
    </>
  );
}

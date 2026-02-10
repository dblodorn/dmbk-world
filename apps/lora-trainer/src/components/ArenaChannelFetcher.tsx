import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { View, Text, Link, Alert } from "reshaped";
import { trpc } from "@/utils/trpc";
import ChannelUrlForm from "./ChannelUrlForm";
import ImageGrid from "./ImageGrid";
import Sidebar from "./Sidebar";
import type { FormData, ArenaImage } from "./types";

export default function ArenaChannelFetcher() {
  const [submittedUrl, setSubmittedUrl] = useState("");

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
    { enabled: !!submittedUrl }
  );

  const trainLoraMutation = trpc.fal.trainLora.useMutation({
    onSuccess: (data) => console.log("LoRA training started:", data),
    onError: (error) => console.error("LoRA training failed:", error),
  });

  const downloadZipMutation = trpc.fal.downloadImageZip.useMutation({
    onSuccess: (data) => {
      const byteCharacters = atob(data.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/zip" });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = data.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
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
        currentSelected.filter((url) => url !== imageUrl)
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
    try {
      await trainLoraMutation.mutateAsync({
        imageUrls: formData.selectedImages,
        triggerWord: formData.triggerWord,
        steps: formData.trainingSteps,
      });
    } catch (error) {
      console.error("LoRA training error:", error);
    }
  };

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

  return (
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
                trainMutation={trainLoraMutation}
                downloadMutation={downloadZipMutation}
              />
            </View.Item>
          </View>
        )}
      </View>
    </View>
  );
}

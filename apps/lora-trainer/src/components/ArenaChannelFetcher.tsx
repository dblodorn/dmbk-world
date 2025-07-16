import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { trpc } from "@/utils/trpc";

interface FormData {
  url: string;
  selectedImages: string[];
  triggerWord: string;
  trainingSteps: number;
}

export default function ArenaChannelFetcher() {
  const [submittedUrl, setSubmittedUrl] = useState("");

  const { register, handleSubmit, control, setValue } = useForm<FormData>({
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
    onSuccess: (data) => {
      console.log("LoRA training started:", data);
    },
    onError: (error) => {
      console.error("LoRA training failed:", error);
    },
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

  const getImageUrl = (image: {
    image?: {
      display?: { url: string };
      large?: { url: string };
      original?: { url: string };
    };
  }) => {
    return (
      image.image?.display?.url ||
      image.image?.large?.url ||
      image.image?.original?.url
    );
  };

  const isImageSelected = (imageUrl: string) => {
    return selectedImages?.includes(imageUrl) || false;
  };

  const handleTrainLora = async (formData: FormData) => {
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

  return (
    <div className="w-full max-w-7xl mx-auto p-6">
      <form onSubmit={handleSubmit(onSubmit)} className="mb-8">
        <div className="flex gap-4">
          <input
            {...register("url", { required: true })}
            type="url"
            placeholder="Enter are.na channel URL (e.g., https://www.are.na/dain-blodorn-kim/earth-s-objects)"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
          <button
            type="submit"
            disabled={isLoading}
            className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isLoading ? "Loading..." : "Fetch Images"}
          </button>
        </div>
      </form>

      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-300 rounded-md">
          <p className="text-red-700">Error: {error.message}</p>
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Images */}
          <div className="lg:col-span-2">
            <div className="mb-6">
              <h2 className="text-2xl font-bold mb-2">{data.channel.title}</h2>
              <p className="text-gray-600 mb-2">
                Channel:{" "}
                <a
                  href={data.channel.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline"
                >
                  {data.channel.slug}
                </a>
              </p>
              <p className="text-gray-600">Found {data.total} images</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {data.images.map((image) => {
                const imageUrl = getImageUrl(image);
                if (!imageUrl) return null;

                const isSelected = isImageSelected(imageUrl);
                const canSelect = selectedImages.length < 20 || isSelected;

                return (
                  <div
                    key={image.id}
                    className={`border rounded-lg overflow-hidden shadow-md relative ${
                      isSelected ? "ring-2 ring-blue-500" : ""
                    }`}
                  >
                    <div className="absolute top-2 left-2 z-10">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) =>
                          handleImageSelection(imageUrl, e.target.checked)
                        }
                        disabled={!canSelect}
                        className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                      />
                    </div>
                    <img
                      src={imageUrl}
                      alt={image.title || "Untitled"}
                      className={`w-full h-48 object-cover ${
                        !canSelect ? "opacity-50" : ""
                      }`}
                    />
                    <div className="p-3">
                      <h3 className="font-semibold text-sm mb-1 truncate">
                        {image.title || "Untitled"}
                      </h3>
                      <p className="text-xs text-gray-500">
                        {new Date(image.created_at).toLocaleDateString()}
                      </p>
                      {image.source?.url && (
                        <a
                          href={image.source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:underline mt-1 block"
                        >
                          Source
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column - Selected Images */}
          <div className="lg:col-span-1">
            <div className="sticky top-4">
              <h3 className="text-xl font-bold mb-4">
                Selected Images ({selectedImages?.length || 0}/20)
              </h3>

              {selectedImages?.length === 0 ? (
                <p className="text-gray-500 text-sm">
                  No images selected yet. Select up to 20 images from the left
                  panel.
                </p>
              ) : (
                <div className="space-y-3">
                  {selectedImages?.map((imageUrl, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-2 border rounded-md"
                    >
                      <img
                        src={imageUrl}
                        alt={`Selected ${index + 1}`}
                        className="w-16 h-16 object-cover rounded"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium">Image {index + 1}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {imageUrl}
                        </p>
                      </div>
                      <button
                        onClick={() => handleImageSelection(imageUrl, false)}
                        className="text-red-500 hover:text-red-700 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {selectedImages?.length > 0 && (
                <div className="mt-4 space-y-4">
                  <div className="p-3 bg-gray-50 rounded-md">
                    <p className="text-sm font-medium mb-2">
                      LoRA Training Settings:
                    </p>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          Trigger Word:
                        </label>
                        <input
                          {...register("triggerWord", { required: true })}
                          type="text"
                          placeholder="e.g., mystyle, myart, mycharacter"
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          Training Steps:
                        </label>
                        <input
                          {...register("trainingSteps", {
                            min: 100,
                            max: 2000,
                            valueAsNumber: true,
                          })}
                          type="number"
                          min="100"
                          max="2000"
                          step="100"
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleSubmit(handleTrainLora)}
                        disabled={
                          trainLoraMutation.isPending ||
                          selectedImages.length === 0
                        }
                        className="w-full px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium"
                      >
                        {trainLoraMutation.isPending
                          ? "Training LoRA..."
                          : "Train LoRA"}
                      </button>
                    </div>
                  </div>

                  {trainLoraMutation.isError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                      <p className="text-sm text-red-700">
                        Error: {trainLoraMutation.error?.message}
                      </p>
                    </div>
                  )}

                  {trainLoraMutation.isSuccess && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                      <p className="text-sm text-green-700 font-medium">
                        LoRA training started successfully!
                      </p>
                      <pre className="text-xs bg-white p-2 rounded border overflow-x-auto mt-2">
                        {JSON.stringify(trainLoraMutation.data, null, 2)}
                      </pre>
                    </div>
                  )}

                  <div className="p-3 bg-gray-50 rounded-md">
                    <p className="text-sm font-medium mb-2">
                      Selected Image URLs:
                    </p>
                    <pre className="text-xs bg-white p-2 rounded border overflow-x-auto">
                      {JSON.stringify(selectedImages, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

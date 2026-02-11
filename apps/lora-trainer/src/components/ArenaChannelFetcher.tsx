import { useState, useCallback, useEffect, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { View, Alert } from "reshaped";
import { zodResolver } from "@hookform/resolvers/zod";
import { trpc } from "@/utils/trpc";
import { downloadBase64File } from "@/utils/downloadBase64File";
import { authClient } from "@/lib/auth-client";
import { QA_WALLETS } from "@/lib/constants";
import ChannelUrlForm from "./ChannelUrlForm";
import ArenaChannelResults from "./ArenaChannelResults";
import Sidebar from "./Sidebar";
import TrainingProgress from "./TrainingProgress";
import PaymentGate from "./PaymentGate";
import { formSchema, type FormData } from "./types";

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
  const [showPaymentGate, setShowPaymentGate] = useState(false);

  // Session + payment config for privilege checks
  const { data: session } = authClient.useSession();
  const ethPriceQuery = trpc.payment.getEthPrice.useQuery(undefined, {
    enabled: !!session,
  });

  // Determine if current wallet is exempt from payment
  const isExempt = useMemo(() => {
    if (!session) return false;
    const walletAddress = (session.user as Record<string, unknown>).walletAddress as string | undefined;
    if (!walletAddress) return false;
    const addr = walletAddress.toLowerCase();

    // Check admin wallet
    if (ethPriceQuery.data?.adminWallet && addr === ethPriceQuery.data.adminWallet.toLowerCase()) {
      return true;
    }
    // Check QA wallets
    return QA_WALLETS.some((qa) => qa.toLowerCase() === addr);
  }, [session, ethPriceQuery.data]);

  const { handleSubmit, control, setValue, getValues } = useForm<FormData>({
    resolver: zodResolver(formSchema),
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

  const handleTrainLora = useCallback(async (paymentTxHash?: string) => {
    const formData = getValues();
    if (!formData.selectedImages || formData.selectedImages.length === 0) {
      alert("Please select at least one image to train the LoRA");
      return;
    }
    if (!formData.triggerWord.trim()) {
      alert("Please enter a trigger word for the LoRA");
      return;
    }

    // If not exempt and no payment yet, show payment gate
    if (!isExempt && !paymentTxHash) {
      setShowPaymentGate(true);
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
        ...(paymentTxHash ? { paymentTxHash } : {}),
      });
    } catch {
      // error handled in onError callback
    }
  }, [getValues, isExempt, trainLoraMutation]);

  const handlePaymentComplete = useCallback(
    (txHash: string) => {
      setShowPaymentGate(false);
      // Trigger training with the payment tx hash
      handleTrainLora(txHash);
    },
    [handleTrainLora],
  );

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
      <View
        width="100%"
        height="100%"
        padding={2}
        direction="column"
        attributes={{ style: { display: "flex", flexDirection: "column" } }}
      >
        <View
          position="sticky"
          insetTop={0}
          attributes={{ style: { zIndex: 10 } }}
          backgroundColor="page"
          paddingBottom={2}
        >
          <ChannelUrlForm
            control={control}
            onSubmit={handleSubmit(onSubmit)}
            isLoading={isLoading}
          />
        </View>

        {error && (
          <Alert color="critical">Error: {error.message}</Alert>
        )}

        {data && (
          <View
            direction={{ s: "column", l: "row" }}
            gap={2}
            attributes={{
              style: { flex: "1 1 0%", minHeight: 0, overflow: "hidden" },
            }}
          >
            <View.Item
              columns={{ s: 12, l: 9 }}
              attributes={{ style: { height: "100%", overflow: "hidden" } }}
            >
              <View
                className="scrollbar-hidden"
                padding={1}
                attributes={{
                  style: { height: "100%", overflowY: "auto" },
                }}
              >
                <ArenaChannelResults
                  channel={data.channel}
                  total={data.total}
                  images={data.images}
                  selectedImages={selectedImages}
                  onImageSelect={handleImageSelection}
                />
              </View>
            </View.Item>

            <View.Item
              columns={{ s: 12, l: 3 }}
              attributes={{ style: { height: "100%", overflowY: "auto" } }}
            >
              <Sidebar
                selectedImages={selectedImages}
                control={control}
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

      <PaymentGate
        active={showPaymentGate}
        onClose={() => setShowPaymentGate(false)}
        onPaymentComplete={handlePaymentComplete}
      />
    </>
  );
}

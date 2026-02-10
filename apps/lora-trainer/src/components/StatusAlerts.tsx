import { View, Alert, Text } from "reshaped";

interface MutationState {
  isError: boolean;
  isSuccess: boolean;
  error?: { message: string } | null;
  data?: unknown;
}

interface StatusAlertsProps {
  trainMutation: MutationState;
  downloadMutation: MutationState;
}

export default function StatusAlerts({
  trainMutation,
  downloadMutation,
}: StatusAlertsProps) {
  const hasAlerts =
    downloadMutation.isError ||
    downloadMutation.isSuccess ||
    trainMutation.isError ||
    trainMutation.isSuccess;

  if (!hasAlerts) return null;

  return (
    <View gap={3}>
      {downloadMutation.isError && (
        <Alert color="critical" title="Download Error">
          {downloadMutation.error?.message}
        </Alert>
      )}

      {downloadMutation.isSuccess && (
        <Alert color="primary" title="Download Complete">
          <View gap={1}>
            <Text variant="body-2">Zip archive downloaded successfully!</Text>
            <Text variant="caption-1" color="neutral-faded">
              Check your Downloads folder for the zip file.
            </Text>
          </View>
        </Alert>
      )}

      {trainMutation.isError && (
        <Alert color="critical" title="Training Error">
          {trainMutation.error?.message}
        </Alert>
      )}

      {trainMutation.isSuccess && (
        <Alert color="positive" title="Training Started">
          <View gap={2}>
            <Text variant="body-2">LoRA training started successfully!</Text>
            <pre
              style={{
                fontSize: 12,
                background: "var(--rs-color-background-elevation-raised)",
                padding: 8,
                borderRadius: 4,
                overflow: "auto",
              }}
            >
              {JSON.stringify(trainMutation.data, null, 2)}
            </pre>
          </View>
        </Alert>
      )}
    </View>
  );
}

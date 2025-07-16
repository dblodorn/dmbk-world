import { trpc } from "@/utils/trpc";

export default function FalTest() {
  const { data, isLoading, error } = trpc.fal.test.useQuery({
    message: "connection test",
  });

  if (isLoading)
    return <div className="p-4">Testing FAL AI configuration...</div>;
  if (error)
    return <div className="p-4 text-red-600">Error: {error.message}</div>;

  // Type-safe access to the response data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = data as any; // Temporary type assertion until types are rebuilt

  return (
    <div className="p-4 border border-gray-300 rounded-md">
      <h3 className="font-semibold mb-2">FAL AI Configuration Test</h3>
      <div className="space-y-2 text-sm">
        <p>
          <strong>Message:</strong> {response?.message}
        </p>
        <p>
          <strong>API Key Configured:</strong>
          <span
            className={
              response?.apiKeyConfigured ? "text-green-600" : "text-red-600"
            }
          >
            {response?.apiKeyConfigured ? " ✅ Yes" : " ❌ No"}
          </span>
        </p>
        <p>
          <strong>API Key Preview:</strong> {response?.apiKeyPreview}
        </p>
      </div>
      {!response?.apiKeyConfigured && (
        <div className="mt-3 p-2 bg-yellow-100 border border-yellow-300 rounded text-sm">
          <p>
            <strong>Setup Required:</strong>
          </p>
          <ol className="list-decimal list-inside mt-1 space-y-1">
            <li>
              Create <code>.env.local</code> file in the project root
            </li>
            <li>
              Add: <code>FAL_AI_API_KEY=your_actual_api_key</code>
            </li>
            <li>Restart the development server</li>
          </ol>
        </div>
      )}
    </div>
  );
}

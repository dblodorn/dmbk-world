import { View, Text, Button } from "reshaped";
import { useRouter } from "next/router";
import { authClient } from "@/lib/auth-client";

export default function WalletStatus() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) return null;

  if (!session) {
    return (
      <Button
        color="primary"
        size="small"
        onClick={() => router.push("/auth/signin")}
      >
        Connect Wallet
      </Button>
    );
  }

  const address = (session.user as Record<string, unknown>).walletAddress as string | undefined;
  const truncated = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : "Connected";

  return (
    <View direction="row" align="center" gap={3}>
      <Text
        variant="body-3"
        attributes={{ style: { fontFamily: "monospace" } }}
      >
        {truncated}
      </Text>
      <Button
        color="neutral"
        size="small"
        onClick={async () => {
          await authClient.signOut();
          router.push("/");
        }}
      >
        Sign Out
      </Button>
    </View>
  );
}

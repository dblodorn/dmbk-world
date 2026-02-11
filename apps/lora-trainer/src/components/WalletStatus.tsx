import { View, Button } from "reshaped";
import { useRouter } from "next/router";
import { authClient } from "@/lib/auth-client";

export default function WalletStatus() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) return null;

  return (
    <View
      position="fixed"
      insetEnd={2}
      insetBottom={2}
      width={112 / 4}
    >
      {!session ? (
        <Button
          fullWidth
          color="primary"
          onClick={() => router.push("/auth/signin")}
        >
          AUTH
        </Button>
      ) : (
        <Button
          fullWidth
          color="primary"
          onClick={async () => {
            await authClient.signOut();
            router.push("/");
          }}
        >
          Sign Out
        </Button>
      )}
    </View>
  );
}

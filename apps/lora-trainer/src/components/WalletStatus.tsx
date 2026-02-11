import { View, Button } from "reshaped";
import { authClient } from "@/lib/auth-client";
import { useAuthModal } from "./AuthModalProvider";

export default function WalletStatus() {
  const { openAuthModal } = useAuthModal();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) return null;

  return (
    <View position="fixed" insetEnd={2} insetBottom={2} width={112 / 4}>
      {!session ? (
        <Button fullWidth color="primary" onClick={openAuthModal}>
          AUTH
        </Button>
      ) : (
        <Button
          fullWidth
          color="primary"
          onClick={async () => {
            await authClient.signOut();
          }}
        >
          Sign Out
        </Button>
      )}
    </View>
  );
}

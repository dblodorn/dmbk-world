import { View } from "reshaped";
import ArenaChannelFetcher from "@/components/ArenaChannelFetcher";
import WalletStatus from "@/components/WalletStatus";

export default function Home() {
  return (
    <View minHeight="100vh">
      <View
        direction="row"
        align="center"
        justify="end"
        padding={4}
      >
        <WalletStatus />
      </View>
      <ArenaChannelFetcher />
    </View>
  );
}

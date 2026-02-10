import { View } from "reshaped";
import ArenaChannelFetcher from "@/components/ArenaChannelFetcher";

export default function Home() {
  return (
    <View minHeight="100vh" padding={{ s: 4, l: 8 }}>
      <View direction="column" gap={8} align="center">
        <ArenaChannelFetcher />
      </View>
    </View>
  );
}

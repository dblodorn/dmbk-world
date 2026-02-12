import { View, Text, Button } from "reshaped";
import NextLink from "next/link";
import LoraGallery from "@/components/LoraGallery";
import WalletStatus from "@/components/WalletStatus";

export default function LorasPage() {
  return (
    <View height="100vh" direction="column">
      <View
        direction="row"
        align="center"
        gap={4}
        padding={4}
        borderColor="neutral-faded"
        attributes={{ style: { borderBottomWidth: 1, borderBottomStyle: "solid" } }}
      >
        <View.Item grow>
          <Text variant="title-3" weight="bold">
            LoRA Gallery
          </Text>
        </View.Item>
        <NextLink href="/" passHref legacyBehavior>
          <Button as="a" variant="ghost" size="small">
            Train
          </Button>
        </NextLink>
      </View>

      <View padding={4} attributes={{ style: { flex: 1, overflowY: "auto" } }}>
        <LoraGallery />
      </View>

      <WalletStatus />
    </View>
  );
}
